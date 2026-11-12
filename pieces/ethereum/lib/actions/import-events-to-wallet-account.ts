import { createAction, Property } from "@powerhousedao/pieces-framework";
import { planImport } from "../plan.js";
import { globalState, toGlobalAction } from "../reactor.js";
import type { EventRow } from "../types.js";

export const WALLET_ACCOUNT_TYPE = "stackfolio/wallet-account";

import { parseJsonish } from "../jsonish.js";

function parseArray(value: unknown, prop: string): unknown[] {
  const parsed = parseJsonish(value, prop);
  if (!Array.isArray(parsed)) {
    throw new Error(`${prop} must be a JSON array.`);
  }
  return parsed;
}

/** The deterministic ledger id: the same chain event always lands under the
 * same id, so replays are byte-identical. */
export function eventId(row: EventRow): string {
  return `${row.eventIdentifier}-${row.sequenceIndex}`;
}

interface WalletLedgerRow {
  id: string;
  eventIdentifier: string;
  sequenceIndex: number;
  ignored: boolean;
  notes: string | null;
  counterpartyLabel: string | null;
  valuation: {
    unit: string;
    price: string;
    source: string;
    granularity: string;
    pinnedAt: string;
  } | null;
}

interface WalletGlobalState {
  ledger?: WalletLedgerRow[];
  backfill?: {
    state: string;
    startBlock: number | null;
    nextBlock: number | null;
  } | null;
  redecode?: {
    state: string;
    startBlock: number | null;
    nextBlock: number | null;
  } | null;
}

/** What a re-decode window replaces: every held row the window re-fetched,
 * with its review fields carried onto the replacement by the reducer, and
 * its valuation carried here (the reducer takes the valuation from the
 * replacement row, and the walk never knows the pinned price). */
export function planReplace(
  held: WalletLedgerRow[],
  incoming: EventRow[],
): {
  remove: Array<{ id: string; sequenceIndex: number }>;
  add: Array<Record<string, unknown>>;
} {
  const byKey = new Map(
    held.map((row) => [`${row.eventIdentifier}#${row.sequenceIndex}`, row]),
  );
  const remove: Array<{ id: string; sequenceIndex: number }> = [];
  const add: Array<Record<string, unknown>> = [];
  for (const row of incoming) {
    const prior = byKey.get(`${row.eventIdentifier}#${row.sequenceIndex}`);
    if (prior) remove.push({ id: prior.id, sequenceIndex: prior.sequenceIndex });
    const valuation = prior?.valuation ?? null;
    add.push({
      id: eventId(row),
      eventIdentifier: row.eventIdentifier,
      sequenceIndex: row.sequenceIndex,
      timestamp: row.timestamp,
      type: row.type,
      subtype: row.subtype,
      asset: row.asset,
      amount: row.amount,
      counterparty: row.counterparty || null,
      notes: row.notes ?? null,
      ...(valuation ? { valuation } : {}),
    });
  }
  return { remove, add };
}

/**
 * The wallet account's import step: read the document, plan against what it
 * already holds, dispatch only the remainder. A rerun of a scanned window is
 * a no-op by construction, so schedulers may run it as often as they like.
 */
export const ethereumImportEventsToWalletAccountAction = createAction({
  // The reactor is the counterparty; no node connection needed.
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "import-events-to-wallet-account",
  displayName: "Import Events into Wallet Account",
  description:
    "File scanned ledger events onto a stackfolio/wallet-account document, skipping every event the ledger already holds (keyed by event identifier and sequence index), so overlapping windows and reruns never import twice. Optionally advances the scan cursor and records the native balance in the same dispatch.",
  props: {
    walletDocumentId: Property.ShortText({
      displayName: "Wallet account document id",
      required: true,
    }),
    eventsJson: Property.Json({
      displayName: "Event rows (JSON)",
      description:
        "The JSON array of decoded event rows from the scan step ({{steps.scan.output.rows}}).",
      required: true,
    }),
    batchId: Property.ShortText({
      displayName: "Import batch id",
      description: "Identifies this import run on every filed event.",
      required: true,
    }),
    importedAt: Property.ShortText({
      displayName: "Imported at (ISO timestamp)",
      required: true,
    }),
    scanProgressJson: Property.Json({
      displayName: "Scan progress (JSON)",
      description:
        'Optional cursor payload, e.g. {"lastLogsBlock":21000,"ranAt":"…"}. Dispatched as RECORD_SCAN_PROGRESS.',
      required: false,
    }),
    nativeStateJson: Property.Json({
      displayName: "Native balance (JSON)",
      description:
        'Optional head-state payload {"balance":"<wei>","blockNumber":21000}. Dispatched as SET_NATIVE_BALANCE.',
      required: false,
    }),
    backfillDone: Property.Checkbox({
      displayName: "Backfill finished",
      description:
        "Set from {{steps.walk.output.done}}: when the walk ran past the head, the document's backfill state is retired to DONE.",
      required: false,
      defaultValue: false,
    }),
    backfillNextBlock: Property.Number({
      displayName: "Backfill cursor (next block)",
      description:
        "The walk step's nextBlock: advances backfill.nextBlock so the next run continues instead of repeating the window.",
      required: false,
    }),
    redecode: Property.Checkbox({
      displayName: "Re-decode import",
      description:
        "Replace instead of skip: every held row the window re-fetched is removed and re-imported from the decoded rows, carrying its review fields and pinned valuation. Advances the redecode cursor, not the backfill one.",
      required: false,
      defaultValue: false,
    }),
    redecodeDone: Property.Checkbox({
      displayName: "Re-decode finished",
      description:
        "Set from {{steps.walk.output.done}}: retires the redecode walk to DONE.",
      required: false,
      defaultValue: false,
    }),
    redecodeNextBlock: Property.Number({
      displayName: "Re-decode cursor (next block)",
      description:
        "The walk step's nextBlock: advances redecode.nextBlock so the next run continues instead of repeating the window.",
      required: false,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    const events = parseArray(p.eventsJson, "eventsJson") as EventRow[];

    const doc = await context.reactor.get(p.walletDocumentId);
    if (doc.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(
        `Document ${p.walletDocumentId} is a ${doc.header.documentType}, not ${WALLET_ACCOUNT_TYPE}.`,
      );
    }
    const global = globalState<WalletGlobalState>(doc);
    const held = (global.ledger ?? []).map(
      ({ eventIdentifier, sequenceIndex }) => ({
        eventIdentifier,
        sequenceIndex,
      }),
    );

    const actions = [];
    if (p.redecode) {
      // The retrofit path: the window's decoded rows replace the held
      // generic ones - review fields carry in the reducer, valuations
      // here - and the redecode cursor, not the backfill one, advances.
      const { remove, add } = planReplace(global.ledger ?? [], events);
      if (remove.length > 0 || add.length > 0) {
        actions.push(
          toGlobalAction("REPLACE_EVENTS", {
            batchId: p.batchId,
            remove,
            add,
          }),
        );
      }
      actions.push(
        toGlobalAction("SET_REDECODE_STATE", {
          state: p.redecodeDone ? "DONE" : "NATIVE",
          startBlock: global.redecode?.startBlock ?? 0,
          nextBlock: p.redecodeNextBlock ?? global.redecode?.nextBlock ?? null,
        }),
      );
      await context.reactor.execute(p.walletDocumentId, "main", actions);
      return {
        replaced: add.length,
        walletDocumentId: p.walletDocumentId,
      };
    }

    const planned = planImport(held, events);

    if (planned.length > 0) {
      actions.push(
        toGlobalAction("IMPORT_EVENTS", {
          batchId: p.batchId,
          importedAt: p.importedAt,
          events: planned.map((row) => ({
            id: eventId(row),
            eventIdentifier: row.eventIdentifier,
            sequenceIndex: row.sequenceIndex,
            timestamp: row.timestamp,
            type: row.type,
            subtype: row.subtype,
            asset: row.asset,
            amount: row.amount,
            counterparty: row.counterparty || null,
            notes: row.notes ?? null,
          })),
        }),
      );
    }
    if (p.scanProgressJson) {
      const progress = parseJsonish(p.scanProgressJson, "scanProgressJson") as {
        lastLogsBlock?: number;
        lastNativeScanBlock?: number;
        lastEventTimestamp?: string;
        ranAt?: string;
      };
      actions.push(
        toGlobalAction("RECORD_SCAN_PROGRESS", {
          lastLogsBlock: progress.lastLogsBlock ?? null,
          lastNativeScanBlock: progress.lastNativeScanBlock ?? null,
          lastEventTimestamp: progress.lastEventTimestamp ?? null,
          ranAt: progress.ranAt ?? p.importedAt,
        }),
      );
    }
    if (p.nativeStateJson) {
      const native = parseJsonish(p.nativeStateJson, "nativeStateJson") as {
        balance: string;
        blockNumber: number;
      };
      actions.push(
        toGlobalAction("SET_NATIVE_BALANCE", {
          amount: native.balance,
          blockNumber: native.blockNumber,
          observedAt: p.importedAt,
        }),
      );
    }
    const backfillNext = p.backfillNextBlock ?? null;
    if (p.backfillDone || backfillNext !== null) {
      const backfill = globalState<{
        backfill?: {
          state: string;
          startBlock: number | null;
          nextBlock: number | null;
        };
      }>(doc).backfill;
      actions.push(
        toGlobalAction("SET_BACKFILL_STATE", {
          state: p.backfillDone ? "DONE" : (backfill?.state ?? "NATIVE"),
          startBlock: backfill?.startBlock ?? null,
          nextBlock: backfillNext ?? backfill?.nextBlock ?? null,
        }),
      );
    }
    if (actions.length > 0) {
      await context.reactor.execute(p.walletDocumentId, "main", actions);
    }
    return { imported: planned.length, walletDocumentId: p.walletDocumentId };
  },
});
