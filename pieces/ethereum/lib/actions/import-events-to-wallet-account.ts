import { createAction, Property } from "@powerhousedao/pieces-framework";
import { planImport } from "../plan.js";
import { globalState, toGlobalAction } from "../reactor.js";
import type { EventRow } from "../types.js";

export const WALLET_ACCOUNT_TYPE = "stackfolio/wallet-account";

function parseArray(json: string, prop: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`${prop} must be a JSON array.`);
  }
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

interface WalletGlobalState {
  ledger?: Array<{ eventIdentifier: string; sequenceIndex: number }>;
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
    eventsJson: Property.LongText({
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
    scanProgressJson: Property.LongText({
      displayName: "Scan progress (JSON)",
      description:
        'Optional cursor payload, e.g. {"lastLogsBlock":21000,"ranAt":"…"}. Dispatched as RECORD_SCAN_PROGRESS.',
      required: false,
    }),
    nativeStateJson: Property.LongText({
      displayName: "Native balance (JSON)",
      description:
        'Optional head-state payload {"balance":"<wei>","blockNumber":21000}. Dispatched as SET_NATIVE_BALANCE.',
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
    const planned = planImport(held, events);

    const actions = [];
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
      const progress = JSON.parse(p.scanProgressJson) as {
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
      const native = JSON.parse(p.nativeStateJson) as {
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
    if (actions.length > 0) {
      await context.reactor.execute(p.walletDocumentId, "main", actions);
    }
    return { imported: planned.length, walletDocumentId: p.walletDocumentId };
  },
});
