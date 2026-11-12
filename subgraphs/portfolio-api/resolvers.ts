import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { PortfolioIndex } from "processors/portfolio-index";
import { driveFileIds, forwardEnsAddress } from "./lib.js";

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

      events: async (
        _parent: unknown,
        args: {
          driveId: string;
          address?: string;
          asset?: string;
          types?: string[];
          ignored?: boolean;
          from?: string;
          to?: string;
          query?: string;
          first?: number;
          offset?: number;
        },
        ctx: Context,
      ) => {
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return { rows: [], total: 0 };
        const filtered = query(args.driveId).selectFrom("events").where("document_id", "in", ids)
          .$if(Boolean(args.address), (qb) =>
            qb.where("address", "=", args.address as string),
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
        return { rows, total: Number(totalRow.total) };
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
        return query(args.driveId)
          .selectFrom("prices_latest")
          .select([
            "asset",
            "price",
            "source",
            "fetched_at as fetchedAt",
          ])
          .orderBy("asset")
          .execute();
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
