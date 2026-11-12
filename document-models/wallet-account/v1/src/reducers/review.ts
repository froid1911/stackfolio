import type { WalletAccountReviewOperations } from "document-models/wallet-account/v1";
import { EventNotFoundError } from "../../gen/review/error.js";

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
};
