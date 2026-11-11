import type { WalletAccountFeedOperations } from "document-models/wallet-account/v1";
import {
  DuplicateEventError,
  EmptyImportError,
  InvalidAmountError,
} from "../../gen/feed/error.js";

export const walletAccountFeedOperations: WalletAccountFeedOperations = {
  importEventsOperation(state, action) {
    if (action.input.events.length === 0) {
      throw new EmptyImportError(
        "An import batch must carry at least one event",
      );
    }
    const isDecimal = (value: string) =>
      /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value);
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
      });
    }
  },
};
