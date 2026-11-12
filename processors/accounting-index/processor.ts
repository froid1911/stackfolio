/**
 * The accounting index: keeps FCFS cost-basis books over the ledger.
 *
 * Ledger events, the portfolio's address book and the registry's decimals
 * are staged into tables (whole-state diff, one row per event); the fold
 * itself runs only when the staged input or the pricing context actually
 * changed - the checkpoint row records both hashes and the serialized fold
 * state. A re-fold rebuilds lots, realized disposals, income and monthly
 * aggregates in one deterministic pass, so editing a row and re-folding
 * equals replaying the edited ledger from genesis.
 */
import { RelationalDbProcessor } from "@powerhousedao/shared/processors";
import type { OperationWithContext } from "document-model";
import type { DocumentReader } from "../shared/delivery.js";
import { stateFetcher } from "../shared/delivery.js";
import { down, up } from "./migrations.js";
import {
  foldAll,
  serializeFold,
  type FoldContext,
  type FoldState,
} from "./fold.js";
import {
  foldInputHash,
  portfolioAddressRows,
  registryAssetRows,
  rowKey,
  toFoldEvents,
  walletEventRows,
} from "./stage.js";
import type { AddressRow, AssetRow, DB, EventRow } from "./schema.js";
import { planDiff, unwrapState } from "../portfolio-index/rows.js";

export { WALLET_DOCUMENT_TYPE } from "../portfolio-index/processor.js";
import {
  PORTFOLIO_DOCUMENT_TYPE,
  REGISTRY_DOCUMENT_TYPE,
  WALLET_DOCUMENT_TYPE,
} from "../portfolio-index/processor.js";

export const ACCOUNTING_DOCUMENT_TYPES = [
  WALLET_DOCUMENT_TYPE,
  PORTFOLIO_DOCUMENT_TYPE,
  REGISTRY_DOCUMENT_TYPE,
] as const;

const FOLLOWED = new Set<string>(ACCOUNTING_DOCUMENT_TYPES);
const FOLD_VERSION = 1;
const CURRENCY = "EUR";
const BATCH = 200;

interface Latest {
  documentType: string;
  resultingState: string;
}

/** Scaled-by-1e8 decimal text without trailing zeros. */
function formatScaled(value: bigint, scale = 8): string {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale) || "0";
  const fraction = digits.slice(-scale).replace(/0+$/, "");
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

export class AccountingIndex extends RelationalDbProcessor<DB> {
  /** Writes are serialised: two batches must not interleave the fold. */
  private queue: Promise<void> = Promise.resolve();

  /** Fallback state source for stateless deliveries; wired by the factory. */
  private fetchState?: (documentId: string) => Promise<string | undefined>;

  setDocumentReader(read: DocumentReader): void {
    this.fetchState = stateFetcher(read, "accounting-index");
  }

  onOperations(operations: OperationWithContext[]): Promise<void> {
    const next = this.queue.then(() => this.index(operations));
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

  /** Test and teardown helper: removes every table this index created. */
  async teardown(): Promise<void> {
    await down(this.relationalDb);
  }

  private async index(operations: OperationWithContext[]): Promise<void> {
    const latest = new Map<string, Latest>();
    const deleted = new Set<string>();
    const statelessDocs = new Map<string, string>();

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
      const outcome = operation as unknown as {
        error?: string;
        deniedReason?: string;
      };
      if (outcome.error !== undefined || outcome.deniedReason !== undefined) {
        continue;
      }
      if (deleted.has(documentId)) continue;
      if (!context.resultingState) {
        statelessDocs.set(documentId, documentType);
        continue;
      }
      statelessDocs.delete(documentId);
      latest.set(documentId, { documentType, resultingState: context.resultingState });
    }

    // A stateless delivery is not a reason to leave rows stale: read the
    // document's current state off the reactor instead.
    for (const [documentId, documentType] of statelessDocs) {
      if (!this.fetchState) continue;
      const state = await this.fetchState(documentId);
      if (state === undefined) continue;
      latest.set(documentId, { documentType, resultingState: state });
    }

    for (const documentId of deleted) {
      await this.deleteDocumentRows(documentId);
    }

    for (const [documentId, entry] of latest) {
      let parsed: unknown;
      try {
        parsed = unwrapState(JSON.parse(entry.resultingState));
      } catch {
        console.warn(`[accounting-index] ${documentId}: state is not JSON`);
        continue;
      }
      switch (entry.documentType) {
        case WALLET_DOCUMENT_TYPE: {
          const staged = walletEventRows(documentId, parsed);
          if (staged) await this.writeEvents(staged.rows);
          break;
        }
        case PORTFOLIO_DOCUMENT_TYPE: {
          await this.writeAddresses(
            documentId,
            portfolioAddressRows(documentId, parsed),
          );
          break;
        }
        default: {
          await this.writeAssets(
            documentId,
            registryAssetRows(documentId, parsed),
          );
          break;
        }
      }
    }

    await this.recomputeFold();
  }

  private async writeEvents(rows: EventRow[]): Promise<void> {
    const stored = await this.relationalDb
      .selectFrom("acc_events")
      .selectAll()
      .where("document_id", "=", rows[0]?.document_id ?? "")
      .execute();
    const { deletes, writes } = planDiff(stored, rows, rowKey);
    for (const eventId of deletes) {
      await this.relationalDb
        .deleteFrom("acc_events")
        .where("document_id", "=", rows[0]?.document_id ?? "")
        .where("event_id", "=", eventId.split("|")[1] ?? eventId)
        .execute();
    }
    for (let at = 0; at < writes.length; at += BATCH) {
      const chunk = writes.slice(at, at + BATCH);
      await this.relationalDb
        .insertInto("acc_events")
        .values(chunk)
        .onConflict((oc) =>
          oc.columns(["document_id", "event_id"]).doUpdateSet((eb) => ({
            wallet: eb.ref("excluded.wallet"),
            event_identifier: eb.ref("excluded.event_identifier"),
            sequence_index: eb.ref("excluded.sequence_index"),
            timestamp: eb.ref("excluded.timestamp"),
            type: eb.ref("excluded.type"),
            subtype: eb.ref("excluded.subtype"),
            asset: eb.ref("excluded.asset"),
            amount: eb.ref("excluded.amount"),
            counterparty: eb.ref("excluded.counterparty"),
            ignored: eb.ref("excluded.ignored"),
            price: eb.ref("excluded.price"),
            price_unit: eb.ref("excluded.price_unit"),
            price_source: eb.ref("excluded.price_source"),
          })),
        )
        .execute();
    }
  }

  private async writeAddresses(
    documentId: string,
    rows: AddressRow[],
  ): Promise<void> {
    const stored = await this.relationalDb
      .selectFrom("acc_addresses")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const { deletes, writes } = planDiff(
      stored,
      rows,
      (row) => row.address,
    );
    for (const address of deletes) {
      await this.relationalDb
        .deleteFrom("acc_addresses")
        .where("document_id", "=", documentId)
        .where("address", "=", address)
        .execute();
    }
    for (let at = 0; at < writes.length; at += BATCH) {
      await this.relationalDb
        .insertInto("acc_addresses")
        .values(writes.slice(at, at + BATCH))
        .execute();
    }
  }

  private async writeAssets(documentId: string, rows: AssetRow[]): Promise<void> {
    const stored = await this.relationalDb
      .selectFrom("acc_assets")
      .selectAll()
      .where("document_id", "=", documentId)
      .execute();
    const { deletes, writes } = planDiff(stored, rows, (row) => row.asset);
    for (const asset of deletes) {
      await this.relationalDb
        .deleteFrom("acc_assets")
        .where("document_id", "=", documentId)
        .where("asset", "=", asset)
        .execute();
    }
    for (let at = 0; at < writes.length; at += BATCH) {
      const chunk = writes.slice(at, at + BATCH);
      await this.relationalDb
        .insertInto("acc_assets")
        .values(chunk)
        .onConflict((oc) =>
          oc.columns(["document_id", "asset"]).doUpdateSet((eb) => ({
            decimals: eb.ref("excluded.decimals"),
          })),
        )
        .execute();
    }
  }

  private async recomputeFold(): Promise<void> {
    const events = await this.relationalDb
      .selectFrom("acc_events")
      .selectAll()
      .execute();
    const addresses = await this.relationalDb
      .selectFrom("acc_addresses")
      .select("address")
      .execute();
    const assets = await this.relationalDb
      .selectFrom("acc_assets")
      .select(["asset", "decimals"])
      .execute();

    const { inputHash, ctxHash } = foldInputHash(
      events,
      addresses.map((row) => row.address),
      assets.map((row) => [row.asset, row.decimals] as [string, number]),
    );
    const checkpoint = await this.relationalDb
      .selectFrom("fold_checkpoint")
      .selectAll()
      .where("id", "=", "fold")
      .executeTakeFirst();
    if (
      checkpoint &&
      checkpoint.fold_version === FOLD_VERSION &&
      checkpoint.input_hash === inputHash &&
      checkpoint.ctx_hash === ctxHash
    ) {
      return;
    }

    const knownAddresses = new Set<string>([
      ...addresses.map((row) => row.address),
      ...events.map((row) => row.wallet),
    ]);
    const decimals = new Map(
      assets.map((row) => [row.asset, row.decimals] as [string, number]),
    );
    const ctx: FoldContext = {
      method: "FCFS",
      currency: CURRENCY,
      knownAddresses,
      decimals,
    };
    const state: FoldState = foldAll(toFoldEvents(events), ctx);
    await this.writeFoldTables(state);
    await this.relationalDb
      .insertInto("fold_checkpoint")
      .values({
        id: "fold",
        fold_version: FOLD_VERSION,
        ctx_hash: ctxHash,
        input_hash: inputHash,
        state: serializeFold(state),
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet((eb) => ({
          fold_version: eb.ref("excluded.fold_version"),
          ctx_hash: eb.ref("excluded.ctx_hash"),
          input_hash: eb.ref("excluded.input_hash"),
          state: eb.ref("excluded.state"),
        })),
      )
      .execute();
  }

  private async writeFoldTables(state: FoldState): Promise<void> {
    for (const table of ["lots", "realized", "income", "pnl_month"] as const) {
      await this.relationalDb.deleteFrom(table).execute();
    }
    for (const lots of state.lots.values()) {
      const rows = lots.map((lot) => ({
        wallet: lot.wallet,
        asset: lot.asset,
        source_event_id: lot.sourceEventId,
        source_seq: lot.sourceSeq,
        quantity: lot.quantity.toString(),
        unit_cost: formatScaled((lot.cost * 100000000n) / lot.quantity),
      }));
      for (let at = 0; at < rows.length; at += BATCH) {
        await this.relationalDb
          .insertInto("lots")
          .values(rows.slice(at, at + BATCH))
          .execute();
      }
    }
    const realized = state.realized.map((row) => ({
      id: row.id,
      wallet: row.wallet,
      asset: row.asset,
      timestamp: row.timestamp,
      quantity: row.quantity,
      cost: row.cost,
      proceeds: row.proceeds,
      pnl: row.pnl,
      source_event_id: row.sourceEventId,
      source_seq: row.sourceSeq,
      consumed: JSON.stringify(row.consumed),
    }));
    for (let at = 0; at < realized.length; at += BATCH) {
      await this.relationalDb
        .insertInto("realized")
        .values(realized.slice(at, at + BATCH))
        .execute();
    }
    const income = [...state.income.entries()].map(([key, amount]) => {
      const [wallet, bucket, month] = key.split("|");
      return { wallet, bucket, month, amount: amount.toString() };
    });
    for (let at = 0; at < income.length; at += BATCH) {
      await this.relationalDb
        .insertInto("income")
        .values(income.slice(at, at + BATCH))
        .execute();
    }
    const months = [...state.months.entries()].map(([key, agg]) => {
      const [wallet, month] = key.split("|");
      return {
        wallet,
        month,
        income: agg.income.toString(),
        expense: agg.expense.toString(),
        realized_pnl: agg.realized.toString(),
        unpriced_in_count: agg.unpricedIn,
        unpriced_out_count: agg.unpricedOut,
      };
    });
    for (let at = 0; at < months.length; at += BATCH) {
      await this.relationalDb
        .insertInto("pnl_month")
        .values(months.slice(at, at + BATCH))
        .execute();
    }
  }
}
