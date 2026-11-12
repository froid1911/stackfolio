import type { WalletAccountReviewOperations } from "document-models/wallet-account/v1";
import {
  EventNotFoundError,
  InvalidValuationError,
} from "../../gen/review/error.js";

const isDecimal = (value: string): boolean =>
  /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value);

export const walletAccountReviewOperations: WalletAccountReviewOperations = {
  setEventIgnoredOperation(state, action) {
    const event = state.ledger.find((e) => e.id === action.input.id);
    if (!event)
      throw new EventNotFoundError(
        `Event ${action.input.id} is not in the ledger`,
      );
    event.ignored = action.input.ignored;
  },
  setEventNotesOperation(state, action) {
    const event = state.ledger.find((e) => e.id === action.input.id);
    if (!event)
      throw new EventNotFoundError(
        `Event ${action.input.id} is not in the ledger`,
      );
    event.notes = action.input.notes ?? null;
  },
  retypeEventOperation(state, action) {
    const event = state.ledger.find((e) => e.id === action.input.id);
    if (!event)
      throw new EventNotFoundError(
        `Event ${action.input.id} is not in the ledger`,
      );
    event.type = action.input.type;
    event.subtype = action.input.subtype;
  },
  pinValuationsOperation(state, action) {
    const wanted = new Map<
      string,
      (typeof action.input.events)[number]["valuation"]
    >();
    for (const pin of action.input.events) {
      if (!isDecimal(pin.valuation.price) || !pin.valuation.unit) {
        throw new InvalidValuationError(
          "valuation needs a decimal price and a unit",
        );
      }
      const key = `${pin.id}-${pin.sequenceIndex}`;
      if (!wanted.has(key)) wanted.set(key, pin.valuation);
    }
    for (const event of state.ledger) {
      const valuation = wanted.get(`${event.id}-${event.sequenceIndex}`);
      if (!valuation) continue;
      if (
        event.valuation &&
        event.valuation.source === "MANUAL" &&
        valuation.source !== "MANUAL"
      ) {
        continue;
      }
      event.valuation = {
        unit: valuation.unit,
        price: valuation.price,
        source: valuation.source,
        granularity: valuation.granularity,
        pinnedAt: valuation.pinnedAt,
      };
    }
  },
};
