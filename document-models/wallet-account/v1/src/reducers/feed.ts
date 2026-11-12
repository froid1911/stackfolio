import type { WalletAccountFeedOperations } from "document-models/wallet-account/v1";
import {
  DuplicateEventError,
  EmptyImportError,
  EmptyReplacementError,
  InvalidAmountError,
} from "../../gen/feed/error.js";

const isDecimal = (value: string): boolean =>
  /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value);

export const walletAccountFeedOperations: WalletAccountFeedOperations = {
  importEventsOperation(state, action) {
    if (action.input.events.length === 0) {
      throw new EmptyImportError(
        "An import batch must carry at least one event",
      );
    }
    const seen = new Set(
      state.ledger.map((e) => `${e.eventIdentifier}#${e.sequenceIndex}`),
    );
    for (const event of action.input.events) {
      if (!isDecimal(event.amount)) {
        throw new InvalidAmountError(`${event.amount} is not a decimal amount`);
      }
      const key = `${event.eventIdentifier}#${event.sequenceIndex}`;
      if (seen.has(key)) {
        throw new DuplicateEventError(
          `Event ${event.eventIdentifier}#${event.sequenceIndex} already imported`,
        );
      }
      seen.add(key);
    }
    for (const event of action.input.events) {
      state.ledger.push({
        id: event.id,
        eventIdentifier: event.eventIdentifier,
        sequenceIndex: event.sequenceIndex,
        timestamp: event.timestamp,
        type: event.type,
        subtype: event.subtype,
        asset: event.asset,
        amount: event.amount,
        counterparty: event.counterparty ?? null,
        counterpartyLabel: null,
        notes: event.notes ?? null,
        ignored: false,
        source: "CHAIN",
        importBatch: action.input.batchId,
        valuation: event.valuation ?? null,
      });
    }
  },
  replaceEventsOperation(state, action) {
    if (action.input.remove.length === 0 && action.input.add.length === 0) {
      throw new EmptyReplacementError(
        "A replacement must remove or add at least one event",
      );
    }
    for (const event of action.input.add) {
      if (!isDecimal(event.amount)) {
        throw new InvalidAmountError(
          `${event.amount} is not a decimal amount`,
        );
      }
    }
    const removeKeys = new Set(
      action.input.remove.map((e) => `${e.id}-${e.sequenceIndex}`),
    );
    const carried = new Map<
      string,
      {
        ignored: boolean;
        notes: string | null | undefined;
        counterpartyLabel: string | null | undefined;
      }
    >();
    const kept = [];
    for (const event of state.ledger) {
      const key = `${event.id}-${event.sequenceIndex}`;
      if (removeKeys.has(key)) {
        carried.set(key, {
          ignored: event.ignored,
          notes: event.notes,
          counterpartyLabel: event.counterpartyLabel,
        });
        continue;
      }
      kept.push(event);
    }
    const surviving = new Set(
      kept.map((e) => `${e.eventIdentifier}#${e.sequenceIndex}`),
    );
    state.ledger.length = 0;
    for (const event of kept) state.ledger.push(event);
    for (const event of action.input.add) {
      const dedupKey = `${event.eventIdentifier}#${event.sequenceIndex}`;
      if (surviving.has(dedupKey)) continue;
      surviving.add(dedupKey);
      const carry = carried.get(`${event.id}-${event.sequenceIndex}`);
      state.ledger.push({
        id: event.id,
        eventIdentifier: event.eventIdentifier,
        sequenceIndex: event.sequenceIndex,
        timestamp: event.timestamp,
        type: event.type,
        subtype: event.subtype,
        asset: event.asset,
        amount: event.amount,
        counterparty: event.counterparty ?? null,
        counterpartyLabel: carry?.counterpartyLabel ?? null,
        notes: carry?.notes ?? event.notes ?? null,
        ignored: carry?.ignored ?? false,
        valuation: event.valuation ?? null,
        source: "CHAIN",
        importBatch: action.input.batchId,
      });
    }
  },
};
