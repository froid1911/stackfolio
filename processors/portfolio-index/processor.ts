/**
 * Keeps the portfolio index in step with the portfolio, wallet, registry,
 * price-book and staking documents.
 *
 * Rows come only off the operations' resulting state (`rows.ts`); no
 * document is ever loaded. Only the last state per document in a batch is
 * parsed: a replay holds one entry per past operation and the last is the
 * truth. Rows the document no longer holds are deleted, new and changed
 * ones written, unchanged ones left alone - reviewing one ledger event
 * rewrites one row, not ten thousand. After a portfolio's own write, event
 * counterparty labels are refreshed from the address book, the way the
 * finance index refreshes contact names.
 */
import { RelationalDbProcessor } from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import { up } from "./migrations.js";
import {
  portfolioRows,
  planDiff,
  priceRows,
  registryRows,
  stakingRows,
  unwrapState,
  walletRows,
} from "./rows.js";
import type {
  AccountRow,
  AddressLabelRow,
  AssetRow,
  BalancePointRow,
  CheckIssueRow,
  DB,
  EventRow,
  LatestPriceRow,
  OverrideRow,
  PricePointRow,
  SnapshotRow,
  ValidatorRow,
  WithdrawalRow,
} from "./schema.js";

// The subgraph types its queries with the same row shapes.
export type { DB };

export const PORTFOLIO_DOCUMENT_TYPE = "stackfolio/portfolio";
export const WALLET_DOCUMENT_TYPE = "stackfolio/wallet-account";
export const REGISTRY_DOCUMENT_TYPE = "stackfolio/asset-registry";
export const PRICE_BOOK_DOCUMENT_TYPE = "stackfolio/price-book";
export const STAKING_DOCUMENT_TYPE = "stackfolio/eth-staking";

/** Every document type the index follows. */
export const INDEXED_DOCUMENT_TYPES = [
  PORTFOLIO_DOCUMENT_TYPE,
  WALLET_DOCUMENT_TYPE,
  REGISTRY_DOCUMENT_TYPE,
  PRICE_BOOK_DOCUMENT_TYPE,
  STAKING_DOCUMENT_TYPE,
] as const;

const FOLLOWED = new Set<string>(INDEXED_DOCUMENT_TYPES);

const BATCH = 200;

interface Latest {
  documentType: string;
  resultingState: string;
}

export class PortfolioIndex extends RelationalDbProcessor<DB> {
  /** Writes are serialised: two batches for one document must not interleave. */
  private queue: Promise<void> = Promise.resolve();

  onOperations(operations: OperationWithContext[]): Promise<void> {
    const next = this.queue.then(() => this.index(operations));
    // Keep the chain alive after a failure, or one bad batch stalls every
    // later one behind a rejected promise.
    this.queue = next.catch(() => undefined);
    return next;
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  static override getNamespace(driveId: string): string {
    return super.getNamespace(driveId);
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }

  private async index(operations: OperationWithContext[]): Promise<void> {
    const latest = new Map<string, Latest>();
    const deleted = new Set<string>();
    let stateless = 0;

    for (const { operation, context } of operations) {
      const type = operation.action.type;
      if (type === "DELETE_DOCUMENT" || type === "PURGE_DOCUMENT") {
        const input = operation.action.input as { documentId?: string } | null;
        const documentId = input?.documentId ?? context.documentId;
        if (this.isNamespaceDrive(documentId)) {
          await this.dropNamespace();
          return;
        }
        deleted.add(documentId);
        latest.delete(documentId);
        continue;
      }
      const { documentId, documentType } = context;
      if (!FOLLOWED.has(documentType)) continue;
      if (context.scope !== "global") continue;
      // A rejected operation left the state alone; the resultingState we
      // would read is the state before the refusal, not after the change.
      // (The fields exist at runtime; the type here doesn't model them.)
      const outcome = operation as unknown as {
        error?: string;
        deniedReason?: string;
      };
      if (outcome.error !== undefined || outcome.deniedReason !== undefined) {
        continue;
      }
      if (deleted.has(documentId)) continue;
      if (!context.resultingState) {
        stateless += 1;
        continue;
      }
      latest.set(documentId, {
        documentType,
        resultingState: context.resultingState,
      });
    }

    if (stateless > 0) {
      console.warn(
        `[portfolio-index] ${stateless} operation(s) carried no resulting state; the rows stay as they are.`,
      );
    }

    for (const documentId of deleted) {
      await this.deleteDocumentRows(documentId);
    }

    let labelsMoved = false;
    for (const [documentId, entry] of latest) {
      let parsed: unknown;
      try {
        parsed = unwrapState(JSON.parse(entry.resultingState));
      } catch {
        console.warn(`[portfolio-index] ${documentId}: state is not JSON`);
        continue;
      }
      switch (entry.documentType) {
        case WALLET_DOCUMENT_TYPE: {
          const w = walletRows(documentId, parsed);
          if (w) await this.writeWallet(w.account, w.events);
          break;
        }
        case PORTFOLIO_DOCUMENT_TYPE: {
          const p = portfolioRows(documentId, parsed);
          if (p) {
            await this.writePortfolio(documentId, p);
            labelsMoved = true;
          }
          break;
        }
        case REGISTRY_DOCUMENT_TYPE: {
          await this.writeAssets(registryRows(documentId, parsed));
          break;
        }
        case PRICE_BOOK_DOCUMENT_TYPE: {
          const prices = priceRows(documentId, parsed);
          await this.writePrices(prices.latest, prices.history);
          break;
        }
        default: {
          const s = stakingRows(documentId, parsed);
          await this.writeStaking(s.validators, s.balances, s.withdrawals);
          break;
        }
      }
    }

    if (labelsMoved) await this.refreshCounterpartyLabels();
  }

  private async writeWallet(
    account: AccountRow,
    events: EventRow[],
  ): Promise<void> {
    const storedAccount = await this.relationalDb
      .selectFrom("accounts")
      .selectAll()
      .where("document_id", "=", account.document_id)
      .executeTakeFirst();
    if (
      !storedAccount ||
      JSON.stringify(storedAccount) !== JSON.stringify(account)
    ) {
      await this.relationalDb
        .insertInto("accounts")
        .values(account)
        .onConflict((oc) =>
          oc.column("document_id").doUpdateSet((eb) => ({
            address: eb.ref("excluded.address"),
            chain_id: eb.ref("excluded.chain_id"),
            label: eb.ref("excluded.label"),
            ignored: eb.ref("excluded.ignored"),
            last_logs_block: eb.ref("excluded.last_logs_block"),
            last_native_scan_block: eb.ref("excluded.last_native_scan_block"),
            last_run_at: eb.ref("excluded.last_run_at"),
            backfill_state: eb.ref("excluded.backfill_state"),
            native_balance: eb.ref("excluded.native_balance"),
            native_balance_block: eb.ref("excluded.native_balance_block"),
          })),
        )
        .execute();
    }

    const storedEvents = await this.relationalDb
      .selectFrom("events")
      .selectAll()
      .where("document_id", "=", account.document_id)
      .execute();
    const { deletes, writes } = planDiff(
      storedEvents,
      events,
      (row) => row.event_id,
    );
    for (let at = 0; at < deletes.length; at += BATCH) {
      const chunk = deletes.slice(at, at + BATCH);
      await this.relationalDb
        .deleteFrom("events")
        .where((eb) =>
          eb.or(
            chunk.map((eventId) =>
              eb.and([
                eb("document_id", "=", account.document_id),
                eb("event_id", "=", eventId),
              ]),
            ),
          ),
        )
        .execute();
    }
    for (let at = 0; at < writes.length; at += BATCH) {
      const chunk = writes.slice(at, at + BATCH);
      await this.relationalDb
        .insertInto("events")
        .values(chunk)
        .onConflict((oc) =>
          oc.columns(["document_id", "event_id"]).doUpdateSet((eb) => ({
            event_identifier: eb.ref("excluded.event_identifier"),
            sequence_index: eb.ref("excluded.sequence_index"),
            timestamp: eb.ref("excluded.timestamp"),
            type: eb.ref("excluded.type"),
            subtype: eb.ref("excluded.subtype"),
            asset: eb.ref("excluded.asset"),
            amount: eb.ref("excluded.amount"),
            counterparty: eb.ref("excluded.counterparty"),
            counterparty_label: eb.ref("excluded.counterparty_label"),
            notes: eb.ref("excluded.notes"),
            ignored: eb.ref("excluded.ignored"),
            source: eb.ref("excluded.source"),
            address: eb.ref("excluded.address"),
            chain_id: eb.ref("excluded.chain_id"),
            label: eb.ref("excluded.label"),
          })),
        )
        .execute();
    }
  }

  private async writePortfolio(
    documentId: string,
    p: {
      snapshots: SnapshotRow[];
      overrides: OverrideRow[];
      labels: AddressLabelRow[];
      issues: CheckIssueRow[];
    },
  ): Promise<void> {
    // Snapshots only ever grow: diff by id, unchanged rows stay.
    const storedSnapshots = await this.relationalDb
      .selectFrom("snapshots")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const snapshotDiff = planDiff(
      storedSnapshots,
      p.snapshots,
      (row) => row.id,
    );
    for (let at = 0; at < snapshotDiff.writes.length; at += BATCH) {
      await this.relationalDb
        .insertInto("snapshots")
        .values(snapshotDiff.writes.slice(at, at + BATCH))
        .onConflict((oc) =>
          oc.columns(["document_id", "id"]).doUpdateSet((eb) => ({
            timestamp: eb.ref("excluded.timestamp"),
            total_value: eb.ref("excluded.total_value"),
            per_location_json: eb.ref("excluded.per_location_json"),
            per_asset_json: eb.ref("excluded.per_asset_json"),
          })),
        )
        .execute();
    }
    for (const id of snapshotDiff.deletes) {
      await this.relationalDb
        .deleteFrom("snapshots")
        .where("document_id", "=", documentId)
        .where("id", "=", id)
        .execute();
    }

    // Overrides, labels and the open check are small: replace the set.
    await this.relationalDb
      .deleteFrom("price_overrides")
      .where("document_id", "=", documentId)
      .execute();
    if (p.overrides.length > 0) {
      await this.relationalDb
        .insertInto("price_overrides")
        .values(p.overrides)
        .execute();
    }
    await this.relationalDb
      .deleteFrom("address_labels")
      .where("document_id", "=", documentId)
      .execute();
    if (p.labels.length > 0) {
      await this.relationalDb
        .insertInto("address_labels")
        .values(p.labels)
        .execute();
    }
    await this.relationalDb
      .deleteFrom("check_issues")
      .where("document_id", "=", documentId)
      .execute();
    if (p.issues.length > 0) {
      await this.relationalDb
        .insertInto("check_issues")
        .values(p.issues)
        .execute();
    }
  }

  private async writeAssets(assets: AssetRow[]): Promise<void> {
    const documentId = assets[0]?.document_id ?? "";
    const stored = await this.relationalDb
      .selectFrom("assets")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const { deletes, writes } = planDiff(
      stored,
      assets,
      (row) => row.identifier,
    );
    for (const identifier of deletes) {
      await this.relationalDb
        .deleteFrom("assets")
        .where("document_id", "=", documentId)
        .where("identifier", "=", identifier)
        .execute();
    }
    for (let at = 0; at < writes.length; at += BATCH) {
      await this.relationalDb
        .insertInto("assets")
        .values(writes.slice(at, at + BATCH))
        .onConflict((oc) =>
          oc.columns(["document_id", "identifier"]).doUpdateSet((eb) => ({
            symbol: eb.ref("excluded.symbol"),
            name: eb.ref("excluded.name"),
            decimals: eb.ref("excluded.decimals"),
            kind: eb.ref("excluded.kind"),
            chain_id: eb.ref("excluded.chain_id"),
            coingecko_id: eb.ref("excluded.coingecko_id"),
            custom: eb.ref("excluded.custom"),
          })),
        )
        .execute();
    }
  }

  private async writePrices(
    latest: LatestPriceRow[],
    history: PricePointRow[],
  ): Promise<void> {
    const documentId = (latest.at(0) ?? history.at(0))?.document_id ?? "";

    const storedLatest = await this.relationalDb
      .selectFrom("prices_latest")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const latestDiff = planDiff(storedLatest, latest, (row) => row.asset);
    for (const asset of latestDiff.deletes) {
      await this.relationalDb
        .deleteFrom("prices_latest")
        .where("document_id", "=", documentId)
        .where("asset", "=", asset)
        .execute();
    }
    for (let at = 0; at < latestDiff.writes.length; at += BATCH) {
      await this.relationalDb
        .insertInto("prices_latest")
        .values(latestDiff.writes.slice(at, at + BATCH))
        .onConflict((oc) =>
          oc.columns(["document_id", "asset"]).doUpdateSet((eb) => ({
            price: eb.ref("excluded.price"),
            source: eb.ref("excluded.source"),
            fetched_at: eb.ref("excluded.fetched_at"),
          })),
        )
        .execute();
    }

    const storedHistory = await this.relationalDb
      .selectFrom("prices_history")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const historyDiff = planDiff(
      storedHistory,
      history,
      (row) => `${row.asset} ${row.hour}`,
    );
    for (const compound of historyDiff.deletes) {
      const at = compound.lastIndexOf(" ");
      const asset = compound.slice(0, at);
      const hour = compound.slice(at + 1);
      await this.relationalDb
        .deleteFrom("prices_history")
        .where("document_id", "=", documentId)
        .where("asset", "=", asset)
        .where("hour", "=", hour)
        .execute();
    }
    for (let at = 0; at < historyDiff.writes.length; at += BATCH) {
      await this.relationalDb
        .insertInto("prices_history")
        .values(historyDiff.writes.slice(at, at + BATCH))
        .onConflict((oc) =>
          oc.columns(["document_id", "asset", "hour"]).doUpdateSet((eb) => ({
            price: eb.ref("excluded.price"),
            source: eb.ref("excluded.source"),
          })),
        )
        .execute();
    }
  }

  private async writeStaking(
    validators: ValidatorRow[],
    balances: BalancePointRow[],
    withdrawals: WithdrawalRow[],
  ): Promise<void> {
    const documentId =
      (validators.at(0) ?? balances.at(0) ?? withdrawals.at(0))?.document_id ??
      "";

    const storedValidators = await this.relationalDb
      .selectFrom("validators")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const validatorDiff = planDiff(
      storedValidators,
      validators,
      (row) => row.validator_index,
    );
    for (const index of validatorDiff.deletes) {
      await this.relationalDb
        .deleteFrom("validators")
        .where("document_id", "=", documentId)
        .where("validator_index", "=", index)
        .execute();
    }
    for (let at = 0; at < validatorDiff.writes.length; at += BATCH) {
      await this.relationalDb
        .insertInto("validators")
        .values(validatorDiff.writes.slice(at, at + BATCH))
        .onConflict((oc) =>
          oc
            .columns(["document_id", "validator_index"])
            .doUpdateSet((eb) => ({
              public_key: eb.ref("excluded.public_key"),
              withdrawal_address: eb.ref("excluded.withdrawal_address"),
              activation_ts: eb.ref("excluded.activation_ts"),
              exited_ts: eb.ref("excluded.exited_ts"),
              withdrawable_ts: eb.ref("excluded.withdrawable_ts"),
            })),
        )
        .execute();
    }

    const storedBalances = await this.relationalDb
      .selectFrom("staking_balances")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const balanceDiff = planDiff(
      storedBalances,
      balances,
      (row) => `${row.validator_index} ${row.day}`,
    );
    for (const compound of balanceDiff.deletes) {
      const at = compound.indexOf(" ");
      const index = Number(compound.slice(0, at));
      const day = compound.slice(at + 1);
      await this.relationalDb
        .deleteFrom("staking_balances")
        .where("document_id", "=", documentId)
        .where("validator_index", "=", index)
        .where("day", "=", day)
        .execute();
    }
    for (let at = 0; at < balanceDiff.writes.length; at += BATCH) {
      await this.relationalDb
        .insertInto("staking_balances")
        .values(balanceDiff.writes.slice(at, at + BATCH))
        .onConflict((oc) =>
          oc
            .columns(["document_id", "validator_index", "day"])
            .doUpdateSet((eb) => ({
              balance_gwei: eb.ref("excluded.balance_gwei"),
            })),
        )
        .execute();
    }

    const storedWithdrawals = await this.relationalDb
      .selectFrom("withdrawals")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const withdrawalDiff = planDiff(
      storedWithdrawals,
      withdrawals,
      (row) => row.withdrawal_ref,
    );
    for (const ref of withdrawalDiff.deletes) {
      await this.relationalDb
        .deleteFrom("withdrawals")
        .where("document_id", "=", documentId)
        .where("withdrawal_ref", "=", ref)
        .execute();
    }
    for (let at = 0; at < withdrawalDiff.writes.length; at += BATCH) {
      await this.relationalDb
        .insertInto("withdrawals")
        .values(withdrawalDiff.writes.slice(at, at + BATCH))
        .onConflict((oc) =>
          oc.columns(["document_id", "withdrawal_ref"]).doUpdateSet((eb) => ({
            validator_index: eb.ref("excluded.validator_index"),
            amount_gwei: eb.ref("excluded.amount_gwei"),
            block_number: eb.ref("excluded.block_number"),
            timestamp: eb.ref("excluded.timestamp"),
          })),
        )
        .execute();
    }
  }

  /**
   * Events keep a copy of the counterparty's label: when the address book
   * changes, the rows that name a known address pick up the new word.
   * (Kysely, not raw SQL: the namespace handle rewrites built queries and
   * lets raw text through without its search path.)
   */
  private async refreshCounterpartyLabels(): Promise<void> {
    await this.relationalDb
      .updateTable("events")
      .set((eb) => ({
        counterparty_label: eb
          .selectFrom("address_labels as al")
          .select((eb2) => [
            eb2
              .cast<string>(
                eb2.fn.coalesce(eb2.ref("al.label"), eb2.ref("al.ens_name")),
                "text",
              )
              .as("label_pick"),
          ])
          .where("al.address", "=", eb.ref("events.counterparty"))
          .limit(1),
      }))
      .where("counterparty", "is not", null)
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("address_labels as al2")
            .select([eb.val(1).as("one")])
            .where("al2.address", "=", eb.ref("events.counterparty"))
            .where((eb2) =>
              eb2.or([
                eb2("al2.label", "is not", null),
                eb2("al2.ens_name", "is not", null),
              ]),
            ),
        ),
      )
      .execute();
  }
}
