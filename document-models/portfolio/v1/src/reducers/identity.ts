import type { PortfolioIdentityOperations } from "document-models/portfolio/v1";
import {
  CurrencyLockedError,
  InvalidCurrencyError,
} from "../../gen/identity/error.js";

export const portfolioIdentityOperations: PortfolioIdentityOperations = {
  setPortfolioDetailsOperation(state, action) {
    if (
      action.input.baseCurrency != null &&
      !/^[A-Z]{3}$/.test(action.input.baseCurrency)
    ) {
      throw new InvalidCurrencyError(
        `${action.input.baseCurrency} is not a 3-letter currency code`,
      );
    }
    if (
      action.input.baseCurrency != null &&
      action.input.baseCurrency !== state.baseCurrency &&
      state.snapshots.length > 0
    ) {
      throw new CurrencyLockedError(
        "Cannot change the base currency once snapshots exist",
      );
    }
    if (action.input.name != null) state.name = action.input.name;
    if (action.input.baseCurrency != null)
      state.baseCurrency = action.input.baseCurrency;
    if (action.input.autoSnapshotEnabled != null)
      state.autoSnapshot.enabled = action.input.autoSnapshotEnabled;
    if (action.input.autoSnapshotIntervalHours != null)
      state.autoSnapshot.intervalHours = action.input.autoSnapshotIntervalHours;
  },
};
