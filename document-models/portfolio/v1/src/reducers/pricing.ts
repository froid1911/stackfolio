import type { PortfolioPricingOperations } from "document-models/portfolio/v1";
import { InvalidAmountError } from "../../gen/pricing/error.js";

export const portfolioPricingOperations: PortfolioPricingOperations = {
  setPriceOverrideOperation(state, action) {
    if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(action.input.price)) {
      throw new InvalidAmountError(
        `${action.input.price} is not a decimal amount`,
      );
    }
    const existing = state.priceOverrides.find(
      (p) => p.asset === action.input.asset,
    );
    if (existing) {
      existing.price = action.input.price;
      existing.setAt = action.input.setAt;
    } else {
      state.priceOverrides.push({
        asset: action.input.asset,
        price: action.input.price,
        setAt: action.input.setAt,
      });
    }
  },
  removePriceOverrideOperation(state, action) {
    state.priceOverrides = state.priceOverrides.filter(
      (p) => p.asset !== action.input.asset,
    );
  },
  setAssetIgnoredOperation(state, action) {
    if (action.input.ignored) {
      if (!state.ignoredAssets.includes(action.input.asset)) {
        state.ignoredAssets.push(action.input.asset);
      }
    } else {
      state.ignoredAssets = state.ignoredAssets.filter(
        (a) => a !== action.input.asset,
      );
    }
  },
};
