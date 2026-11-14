import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { AccountingIndex } from "processors/accounting-index";
import { PortfolioIndex } from "processors/portfolio-index";
import { txHashOf } from "../../processors/shared/categories.js";
import { queueGroups } from "./queue.js";
import {
  buildBalances,
  driveFileIds,
  forwardEnsAddress,
  attachCategories,
  attachGaps,
  attachValuations,
  holdingsFromRows,
  tokenBalancesOf,
  newestPrices,
  unitCostPerWhole,
  type HoldingsInput,
} from "./lib.js";

/**
 * Queries over the portfolio index. Every resolver: assert the caller can
 * read the drive, keep only rows written by that drive's documents (the
 * namespace holds rows from every drive), then read. Amounts cross as the
 * exact decimal strings the tables hold; the client scales them.
 */
export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const query = (driveId: string) =>
    PortfolioIndex.query(driveId, subgraph.relationalDb);
  /** The portfolio's ignored assets, as the accounting index stages them. */
  const ignoredAssetsOf = async (driveId: string): Promise<Set<string>> => {
    try {
      const rows = await accountingQuery(driveId).selectFrom("acc_ignored_assets").select("asset").execute();
      return new Set(rows.map((r) => r.asset));
    } catch {
      // A store from before the table: nothing is ignored yet.
      return new Set();
    }
  };
  const accountingQuery = (driveId: string) =>
    AccountingIndex.query(driveId, subgraph.relationalDb);

  return {
    Query: {
      portfolioApi: () => ({}),
    },
    PortfolioApiSubgraphQueries: {
      accounts: async (
        _parent: unknown,
        args: { driveId: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId).selectFrom("accounts").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "address",
            "chain_id as chainId",
            "label",
            "ignored",
            "last_logs_block as lastLogsBlock",
            "last_native_scan_block as lastNativeScanBlock",
            "last_run_at as lastRunAt",
            "backfill_state as backfillState",
            "native_balance as nativeBalance",
            "native_balance_block as nativeBalanceBlock",
          ])
          .orderBy("address")
          .execute();
      },

      // ---- holdings: read-time fold of the ledger into a matrix ----
      //
      // Not a table: the snapshot state carries no account attribution
      // (snapshot-portfolio collapses per-wallet nets), so the matrix is
      // folded here from the same indexed events the events view reads,
      // exactly like pieces/ethereum's holdings-from-ledger does for the
      // total — kept in step by the same source. Values price the net at
      // prices_latest with the portfolio's overrides winning; unpriced or
      // unregistered assets cross with a null value and stay out of the
      // totals, never guessed. Native balances are read from the chain
      // (accounts.native_balance) and replace the ledger's native transfers
      // for their wallet: both exist, and summing them doubled the ETH.
      holdings: async (_parent: unknown, args: { driveId: string }, ctx: Context) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0)
          return { holdings: [], perAsset: [], perAccount: [], total: "0" };
        const [events, assets, prices, overrides, accounts, labels] =
          await Promise.all([
            query(args.driveId).selectFrom("events").where("document_id", "in", ids)
              .select(["asset", "address", "amount", "ignored", "type", "chain_id"])
              .execute(),
            query(args.driveId).selectFrom("assets").where("document_id", "in", ids)
              .select(["identifier", "symbol", "decimals", "chain_id"])
              .execute(),
            query(args.driveId).selectFrom("prices_latest").where("document_id", "in", ids)
              .select(["asset", "price", "fetched_at as fetchedAt"])
              .orderBy("fetched_at", "desc")
              .execute(),
            query(args.driveId).selectFrom("price_overrides").where("document_id", "in", ids)
              .select(["asset", "price"])
              .execute(),
            query(args.driveId).selectFrom("accounts").where("document_id", "in", ids)
              .select(["address", "chain_id", "native_balance", "token_balances"])
              .execute(),
            query(args.driveId).selectFrom("address_labels").where("document_id", "in", ids)
              .select(["address", "label", "ens_name"])
              .execute(),
          ]);
        // Assets the portfolio ignores (spam, unlisted tokens) hold nothing.
        const ignoredAssets = await ignoredAssetsOf(args.driveId);

        const decimals: Record<string, number> = {};
        const symbols: Record<string, string> = {};
        for (const asset of assets) {
          decimals[asset.identifier] = asset.decimals;
          symbols[asset.identifier] = asset.symbol;
        }
        // Native ETH identifiers price per chain without a registry row
        // (slip44:60); the ledger stores the same identifier, so both are
        // 18-decimal and named here as a fallback to the registry.
        const nativeOf = (chainId: number) => `eip155:${chainId}/slip44:60`;
        for (const p of prices) {
          if (p.asset.endsWith("/slip44:60") && !(p.asset in decimals)) {
            decimals[p.asset] = 18;
            symbols[p.asset] = p.asset.startsWith("eip155:1/") ? "ETH" : `ETH(${p.asset.slice(7, p.asset.indexOf("/"))})`;
          }
        }

        const ledgerEvents: HoldingsInput["events"] = events
          .filter((e) => !ignoredAssets.has(e.asset))
          .map((e) => ({
          asset: e.asset,
          address: e.address,
          amount: e.amount,
          ignored: e.ignored,
          type: e.type,
        }));
        // Native balances are read from the chain onto the account rows;
        // each replaces the ledger's native transfers for its own chain's
        // identifier and wallet (the snapshot fold does the same).
        const nativeBalances: HoldingsInput["balances"] = accounts
          .filter((a) => a.native_balance !== null)
          .map((a) => ({
            asset: nativeOf(a.chain_id),
            address: a.address,
            amount: a.native_balance as string,
          }));
        // Token balances read from the chain replace the ledger's net the
        // same way: a sum of transfers drifts wherever the scan missed one
        // (swaps, repayments, bridges), a balanceOf does not.
        nativeBalances.push(
          ...accounts
            .flatMap((a) => tokenBalancesOf(a.address, a.token_balances))
            .filter((b) => !ignoredAssets.has(b.asset)),
        );

        // Prices: one newest answer per asset (newestPrices).
        const rows = holdingsFromRows({
          events: ledgerEvents,
          balances: nativeBalances,
          decimals,
          prices: Object.fromEntries(newestPrices(prices).map((p) => [p.asset, p.price])),
          overrides: Object.fromEntries(overrides.map((o) => [o.asset, o.price])),
        });

        const labelByAddress = new Map(
          labels.map((l) => [l.address, { label: l.label, ensName: l.ens_name }]),
        );
        const totals = buildBalances(rows);
        return {
          holdings: rows.map((row) => ({
            ...row,
            symbol: symbols[row.asset] ?? row.asset.slice(-6).toUpperCase(),
          })),
          perAsset: totals.perAsset.map((t) => ({
            ...t,
            symbol: symbols[t.asset] ?? t.asset.slice(-6).toUpperCase(),
          })),
          perAccount: totals.perAccount.map((a) => ({
            ...a,
            label: labelByAddress.get(a.wallet)?.label ?? null,
            ensName: labelByAddress.get(a.wallet)?.ensName ?? null,
          })),
          total: totals.total,
        };
      },

      events: async (
        _parent: unknown,
        args: {
          driveId: string;
          ids?: string[];
          address?: string;
          addresses?: string[];
          asset?: string;
          types?: string[];
          ignored?: boolean;
          from?: string;
          to?: string;
          query?: string;
          needsPrice?: boolean;
          categories?: string[];
          first?: number;
          offset?: number;
        },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return { rows: [], total: 0 };
        const ignoredAssets = args.ignored === false ? await ignoredAssetsOf(args.driveId) : new Set<string>();
        // Valuations live in the accounting namespace: the "needs a price"
        // filter is resolved there first, then applied to the ledger page.
        const acc = accountingQuery(args.driveId);
        let unpricedIds: string[] | null = null;
        // The drive's wallets, as the accounting index knows them: the
        // gap table is keyed by wallet, not by document.
        const wallets = acc
          .selectFrom("acc_events")
          .select("wallet")
          .distinct()
          .where("document_id", "in", ids);
        if (args.needsPrice) {
          // Exactly the legs P&L counted as unpriced, not every leg
          // without a valuation (most of those never reach the books).
          const unpriced = await acc
            .selectFrom("acc_unpriced")
            .where("wallet", "in", wallets)
            .select("event_id")
            .distinct()
            .execute();
          unpricedIds = unpriced.map((r) => r.event_id);
          if (unpricedIds.length === 0) return { rows: [], total: 0 };
        }
        let categoryIds: string[] | null = null;
        if (args.categories?.length) {
          const tagged = await acc
            .selectFrom("acc_event_categories")
            .where("wallet", "in", wallets)
            .where("category", "in", args.categories)
            .select("event_id")
            .distinct()
            .execute();
          categoryIds = tagged.map((r) => r.event_id);
          if (categoryIds.length === 0) return { rows: [], total: 0 };
        }
        const filtered = query(args.driveId).selectFrom("events").where("document_id", "in", ids)
          .$if(unpricedIds !== null, (qb) =>
            qb.where("event_id", "in", unpricedIds as string[]),
          )
          .$if(categoryIds !== null, (qb) =>
            qb.where("event_id", "in", categoryIds as string[]),
          )
          .$if(Boolean(args.ids?.length), (qb) =>
            qb.where("event_id", "in", args.ids as string[]),
          )
          .$if(Boolean(args.address), (qb) =>
            qb.where("address", "=", args.address as string),
          )
          .$if(Boolean(args.addresses?.length), (qb) =>
            qb.where("address", "in", args.addresses as string[]),
          )
          .$if(Boolean(args.asset), (qb) =>
            qb.where("asset", "=", args.asset as string),
          )
          .$if(Boolean(args.types?.length), (qb) =>
            qb.where("type", "in", args.types as string[]),
          )
          .$if(args.ignored !== undefined, (qb) =>
            qb.where("ignored", "=", args.ignored as boolean),
          )
          // The not-ignored view leaves the portfolio's ignored assets out too.
          .$if(args.ignored === false && ignoredAssets.size > 0, (qb) =>
            qb.where("asset", "not in", [...ignoredAssets]),
          )
          .$if(Boolean(args.from), (qb) =>
            qb.where("timestamp", ">=", args.from as string),
          )
          .$if(Boolean(args.to), (qb) =>
            qb.where("timestamp", "<=", args.to as string),
          )
          .$if(Boolean(args.query), (qb) =>
            qb.where((eb) => {
              const like = `%${args.query as string}%`;
              return eb.or([
                eb("asset", "ilike", like),
                eb("counterparty", "ilike", like),
                eb("counterparty_label", "ilike", like),
                eb("notes", "ilike", like),
                eb("event_identifier", "ilike", like),
              ]);
            }),
          );
        const totalRow = await filtered
          .select((eb) => eb.fn.countAll<number>().as("total"))
          .executeTakeFirstOrThrow();
        const limit = Math.min(Math.max(args.first ?? 100, 1), 500);
        const rows = await filtered
          .select([
            "document_id as documentId",
            "event_id as eventId",
            "event_identifier as eventIdentifier",
            "sequence_index as sequenceIndex",
            "timestamp",
            "type",
            "subtype",
            "asset",
            "amount",
            "counterparty",
            "counterparty_label as counterpartyLabel",
            "notes",
            "ignored",
            "source",
            "address",
            "chain_id as chainId",
            "label",
          ])
          .orderBy("timestamp", "desc")
          .orderBy("sequence_index", "desc")
          .limit(limit)
          .offset(args.offset ?? 0)
          .execute();
        const valuations =
          rows.length === 0
            ? []
            : await acc
                .selectFrom("acc_events")
                .where("document_id", "in", ids)
                .where("event_id", "in", rows.map((r) => r.eventId))
                .select([
                  "event_id as eventId",
                  "sequence_index as sequenceIndex",
                  "price",
                  "price_unit as priceUnit",
                  "price_source as priceSource",
                ])
                .execute();
        const gaps =
          rows.length === 0
            ? []
            : await acc
                .selectFrom("acc_unpriced")
                .where("wallet", "in", wallets)
                .where("event_id", "in", rows.map((r) => r.eventId))
                .select(["event_id as eventId", "sequence_index as sequenceIndex", "reason"])
                .execute();
        const categories =
          rows.length === 0
            ? []
            : await acc
                .selectFrom("acc_event_categories")
                .where("wallet", "in", wallets)
                .where("event_id", "in", rows.map((r) => r.eventId))
                .select([
                  "wallet",
                  "event_id as eventId",
                  "sequence_index as sequenceIndex",
                  "category",
                  "source",
                ])
                .execute();
        return {
          rows: attachCategories(attachGaps(attachValuations(rows, valuations), gaps), categories),
          total: Number(totalRow.total),
        };
      },

      classificationQueue: async (
        _parent: unknown,
        args: { driveId: string; addresses?: string[] },
        ctx: Context,
      ) => {
        const empty = { total: 0, value: null, groups: [] };
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return empty;
        const acc = accountingQuery(args.driveId);
        const ignoredAssets = await ignoredAssetsOf(args.driveId);
        const scope = (args.addresses ?? []).map((a) => a.toLowerCase());
        const legs = await acc
          .selectFrom("acc_event_categories as c")
          .innerJoin("acc_events as e", (join) =>
            join
              .onRef("e.wallet", "=", "c.wallet")
              .onRef("e.event_id", "=", "c.event_id")
              .onRef("e.sequence_index", "=", "c.sequence_index"),
          )
          .where("c.category", "=", "UNCLASSIFIED")
          .where("e.document_id", "in", ids)
          .where("e.ignored", "=", false)
          .$if(ignoredAssets.size > 0, (qb) => qb.where("e.asset", "not in", [...ignoredAssets]))
          .$if(scope.length > 0, (qb) => qb.where("e.wallet", "in", scope))
          .select([
            "e.wallet as wallet",
            "e.event_id as eventId",
            "e.sequence_index as sequenceIndex",
            "e.event_identifier as eventIdentifier",
            "e.type as type",
            "e.asset as asset",
            "e.amount as amount",
            "e.counterparty as counterparty",
            "e.price as price",
            "e.price_unit as priceUnit",
          ])
          .execute();
        if (legs.length === 0) return empty;
        const fees = await acc
          .selectFrom("acc_events")
          .where("document_id", "in", ids)
          .where("subtype", "=", "FEE")
          .select(["wallet", "event_identifier as eventIdentifier"])
          .execute();
        const signed = new Set(fees.map((f) => `${f.wallet}|${txHashOf(f.eventIdentifier)}`));
        const decimals = new Map(
          (await acc.selectFrom("acc_assets").select(["asset", "decimals"]).execute()).map(
            (a) => [a.asset, a.decimals] as const,
          ),
        );
        const labels = new Map(
          (
            await query(args.driveId)
              .selectFrom("address_labels")
              .where("document_id", "in", ids)
              .select(["address", "label"])
              .execute()
          )
            .filter((row) => row.label)
            .map((row) => [row.address.toLowerCase(), row.label as string] as const),
        );
        const queue = queueGroups(legs, signed, decimals);
        return {
          ...queue,
          groups: queue.groups.map((group) => ({
            ...group,
            counterpartyLabel: group.counterparty
              ? (labels.get(group.counterparty) ?? null)
              : null,
          })),
        };
      },

      addressLabels: async (
        _parent: unknown,
        args: { driveId: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId).selectFrom("address_labels").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "address",
            "label",
            "ens_name as ensName",
          ])
          .orderBy("address")
          .execute();
      },

      assets: async (
        _parent: unknown,
        args: { driveId: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId).selectFrom("assets").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "identifier",
            "symbol",
            "name",
            "decimals",
            "kind",
            "chain_id as chainId",
            "coingecko_id as coingeckoId",
            "custom",
          ])
          .orderBy("symbol")
          .execute();
      },

      latestPrices: async (
        _parent: unknown,
        args: { driveId: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        const rows = await query(args.driveId)
          .selectFrom("prices_latest")
          .where("document_id", "in", ids)
          .select([
            "asset",
            "price",
            "source",
            "fetched_at as fetchedAt",
          ])
          .execute();
        return newestPrices(rows);
      },

      priceHistory: async (
        _parent: unknown,
        args: { driveId: string; asset?: string; from?: string; to?: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId)
          .selectFrom("prices_history")
          .select(["asset", "hour", "price"])
          .$if(Boolean(args.asset), (qb) =>
            qb.where("asset", "=", args.asset as string),
          )
          .$if(Boolean(args.from), (qb) =>
            qb.where("hour", ">=", args.from as string),
          )
          .$if(Boolean(args.to), (qb) =>
            qb.where("hour", "<=", args.to as string),
          )
          .orderBy("hour")
          .execute();
      },

      priceOverrides: async (
        _parent: unknown,
        args: { driveId: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId).selectFrom("price_overrides").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "asset",
            "price",
            "set_at as setAt",
          ])
          .orderBy("asset")
          .execute();
      },

      snapshots: async (
        _parent: unknown,
        args: { driveId: string; first?: number },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        const rows = await query(args.driveId).selectFrom("snapshots").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "id",
            "timestamp",
            "total_value as totalValue",
            "per_location_json as perLocationJson",
            "per_asset_json as perAssetJson",
          ])
          .orderBy("timestamp", "desc")
          .limit(Math.min(Math.max(args.first ?? 90, 1), 1000))
          .execute();
        return rows.map((row) => ({
          documentId: row.documentId,
          id: row.id,
          timestamp: row.timestamp,
          totalValue: row.totalValue,
          locations: parseJson<unknown[]>(row.perLocationJson, []),
          assets: parseJson<unknown[]>(row.perAssetJson, []),
        }));
      },

      validators: async (
        _parent: unknown,
        args: { driveId: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId).selectFrom("validators").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "validator_index as validatorIndex",
            "public_key as publicKey",
            "withdrawal_address as withdrawalAddress",
            "activation_ts as activationTs",
            "exited_ts as exitedTs",
            "withdrawable_ts as withdrawableTs",
          ])
          .orderBy("validator_index")
          .execute();
      },

      stakingBalances: async (
        _parent: unknown,
        args: {
          driveId: string;
          validatorIndex?: number;
          from?: string;
          to?: string;
        },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId).selectFrom("staking_balances").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "validator_index as validatorIndex",
            "day",
            "balance_gwei as balanceGwei",
          ])
          .$if(args.validatorIndex !== undefined, (qb) =>
            qb.where("validator_index", "=", args.validatorIndex as number),
          )
          .$if(Boolean(args.from), (qb) =>
            qb.where("day", ">=", args.from as string),
          )
          .$if(Boolean(args.to), (qb) =>
            qb.where("day", "<=", args.to as string),
          )
          .orderBy("day")
          .execute();
      },

      withdrawals: async (
        _parent: unknown,
        args: { driveId: string; validatorIndex?: number },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId).selectFrom("withdrawals").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "withdrawal_ref as withdrawalRef",
            "validator_index as validatorIndex",
            "amount_gwei as amountGwei",
            "block_number as blockNumber",
            "timestamp",
          ])
          .$if(args.validatorIndex !== undefined, (qb) =>
            qb.where("validator_index", "=", args.validatorIndex as number),
          )
          .orderBy("timestamp", "desc")
          .execute();
      },

      hyperliquidAccounts: async (
        _parent: unknown,
        args: { driveId: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        const db = query(args.driveId);
        const [accounts, spot, perps] = await Promise.all([
          db.selectFrom("hl_accounts").where("document_id", "in", ids)
            .select([
              "document_id as documentId",
              "address",
              "label",
              "account_value_usd as accountValueUsd",
              "updated_at as updatedAt",
            ])
            .orderBy("address")
            .execute(),
          db.selectFrom("hl_spot").where("document_id", "in", ids)
            .select([
              "document_id as documentId",
              "address",
              "token_index as tokenIndex",
              "coin",
              "total",
              "hold",
            ])
            .orderBy(["address", "token_index"])
            .execute(),
          db.selectFrom("hl_perps").where("document_id", "in", ids)
            .select([
              "document_id as documentId",
              "address",
              "coin",
              "szi",
              "entry_px as entryPx",
              "position_value as positionValue",
              "unrealized_pnl as unrealizedPnl",
            ])
            .orderBy(["address", "coin"])
            .execute(),
        ]);
        return accounts.map((account) => ({
          ...account,
          spot: spot.filter(
            (row) =>
              row.documentId === account.documentId &&
              row.address === account.address,
          ),
          perps: perps.filter(
            (row) =>
              row.documentId === account.documentId &&
              row.address === account.address,
          ),
        }));
      },

      ensAddress: async (
        _parent: unknown,
        args: { name: string; rpcUrl: string },
      ) => forwardEnsAddress(args.rpcUrl, args.name),

      issues: async (
        _parent: unknown,
        args: { driveId: string; severity?: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        return query(args.driveId).selectFrom("check_issues").where("document_id", "in", ids)
          .select([
            "document_id as documentId",
            "seq",
            "code",
            "severity",
            "message",
            "account_id as accountId",
            "at",
          ])
          .$if(Boolean(args.severity), (qb) =>
            qb.where("severity", "=", args.severity as string),
          )
          .orderBy("at", "desc")
          .execute();
      },

      totals: async (
        _parent: unknown,
        args: { driveId: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) {
          return {
            events: 0,
            accounts: 0,
            validators: 0,
            openIssues: 0,
            totalValue: null,
            snapshotAt: null,
          };
        }
        const count = (table: "events" | "accounts" | "validators") =>
          query(args.driveId)
            .selectFrom(table)
            .where("document_id", "in", ids)
            .select((eb) => eb.fn.countAll<number>().as("n"))
            .executeTakeFirstOrThrow()
            .then((r) => Number(r.n));
        const [events, accounts, validators, openIssues] = await Promise.all([
          count("events"),
          count("accounts"),
          count("validators"),
          query(args.driveId).selectFrom("check_issues").where("document_id", "in", ids)
            .select((eb) => eb.fn.countAll<number>().as("n"))
            .executeTakeFirstOrThrow()
            .then((r) => Number(r.n)),
        ]);
        const latest = await query(args.driveId).selectFrom("snapshots").where("document_id", "in", ids)
          .select(["total_value as totalValue", "timestamp"])
          .orderBy("timestamp", "desc")
          .limit(1)
          .executeTakeFirst();
        return {
          events,
          accounts,
          validators,
          openIssues,
          totalValue: latest?.totalValue ?? null,
          snapshotAt: latest?.timestamp ?? null,
        };
      },

      // ---- accounting: lots, realized, income, monthly P&L, unpriced ----
      //
      // The accounting tables key by wallet address, not document id, so
      // "rows of this drive" means "wallets whose events came from this
      // drive's documents" - the acc_events distinct wallet set scopes it.

      openLots: async (
        _parent: unknown,
        args: { driveId: string; wallet?: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        const acc = accountingQuery(args.driveId);
        const rows = await acc
          .selectFrom("lots")
          .where(
            "wallet",
            "in",
            acc
              .selectFrom("acc_events")
              .select("wallet")
              .distinct()
              .where("document_id", "in", ids),
          )
          .$if(Boolean(args.wallet), (qb) =>
            qb.where("wallet", "=", args.wallet as string),
          )
          .select([
            "wallet",
            "asset",
            "source_event_id as sourceEventId",
            "source_seq as sourceSeq",
            "quantity",
            "unit_cost as unitCost",
          ])
          .orderBy("wallet")
          .orderBy("asset")
          .orderBy("source_seq")
          .orderBy("source_event_id")
          .execute();
        const decimals = await acc
          .selectFrom("acc_assets")
          .select(["asset", "decimals"])
          .execute();
        const byAsset = new Map(decimals.map((r) => [r.asset, r.decimals]));
        return rows.map((row) => ({
          ...row,
          unitCost: unitCostPerWhole(row.unitCost, byAsset.get(row.asset)),
        }));
      },

      realizedEvents: async (
        _parent: unknown,
        args: {
          driveId: string;
          wallet?: string;
          from?: string;
          to?: string;
        },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        const acc = accountingQuery(args.driveId);
        const rows = await acc
          .selectFrom("realized")
          .where(
            "wallet",
            "in",
            acc
              .selectFrom("acc_events")
              .select("wallet")
              .distinct()
              .where("document_id", "in", ids),
          )
          .$if(Boolean(args.wallet), (qb) =>
            qb.where("wallet", "=", args.wallet as string),
          )
          .$if(Boolean(args.from), (qb) =>
            qb.where("timestamp", ">=", args.from as string),
          )
          .$if(Boolean(args.to), (qb) =>
            qb.where("timestamp", "<=", args.to as string),
          )
          .select([
            "id",
            "wallet",
            "asset",
            "timestamp",
            "quantity",
            "cost",
            "proceeds",
            "pnl",
            "source_event_id as sourceEventId",
            "source_seq as sourceSeq",
            "consumed",
          ])
          .orderBy("timestamp", "desc")
          .orderBy("source_seq", "desc")
          .execute();
        return rows.map((row) => ({
          ...row,
          consumed: parseJson<
            { sourceEventId: string; quantity: string; cost: string }[]
          >(row.consumed, []),
        }));
      },

      incomeByMonth: async (
        _parent: unknown,
        args: { driveId: string; wallet?: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        const acc = accountingQuery(args.driveId);
        return acc
          .selectFrom("income")
          .where(
            "wallet",
            "in",
            acc
              .selectFrom("acc_events")
              .select("wallet")
              .distinct()
              .where("document_id", "in", ids),
          )
          .$if(Boolean(args.wallet), (qb) =>
            qb.where("wallet", "=", args.wallet as string),
          )
          .select([
            "wallet",
            "bucket",
            "month",
            "amount",
          ])
          .orderBy("month", "desc")
          .orderBy("wallet")
          .orderBy("bucket")
          .execute();
      },

      pnlReport: async (
        _parent: unknown,
        args: {
          driveId: string;
          from: string;
          to: string;
          grouping?: string;
          wallet?: string;
        },
        ctx: Context,
      ) => {
        const grouping = args.grouping ?? "MONTH";
        if (grouping !== "MONTH") {
          throw new Error(`Unsupported P&L grouping "${grouping}"`);
        }
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        const acc = accountingQuery(args.driveId);
        return acc
          .selectFrom("pnl_month")
          .where(
            "wallet",
            "in",
            acc
              .selectFrom("acc_events")
              .select("wallet")
              .distinct()
              .where("document_id", "in", ids),
          )
          .$if(Boolean(args.wallet), (qb) =>
            qb.where("wallet", "=", args.wallet as string),
          )
          .where("month", ">=", args.from.slice(0, 7))
          .where("month", "<=", args.to.slice(0, 7))
          .select([
            "wallet",
            "month",
            "income",
            "expense",
            "realized_pnl as realizedPnl",
            "unpriced_in_count as unpricedIn",
            "unpriced_out_count as unpricedOut",
          ])
          .orderBy("wallet")
          .orderBy("month")
          .execute();
      },

      unpricedSummary: async (
        _parent: unknown,
        args: { driveId: string; wallet?: string },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return [];
        const acc = accountingQuery(args.driveId);
        const rows = await acc
          .selectFrom("pnl_month")
          .where(
            "wallet",
            "in",
            acc
              .selectFrom("acc_events")
              .select("wallet")
              .distinct()
              .where("document_id", "in", ids),
          )
          .$if(Boolean(args.wallet), (qb) =>
            qb.where("wallet", "=", args.wallet as string),
          )
          .select([
            "wallet",
            "month",
            "unpriced_in_count as inCount",
            "unpriced_out_count as outCount",
          ])
          .where((eb) =>
            eb.or([
              eb("unpriced_in_count", ">", 0),
              eb("unpriced_out_count", ">", 0),
            ]),
          )
          .orderBy("wallet")
          .orderBy("month")
          .execute();
        return rows;
      },
    },
  };
};

/**
 * The per_location / per_asset lists crossed as JSON; a malformed blob
 * yields the empty list rather than failing the whole snapshot page.
 */
function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
