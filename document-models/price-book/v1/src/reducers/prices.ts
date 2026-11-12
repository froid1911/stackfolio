import type { PriceBookPricesOperations } from "document-models/price-book/v1";
import {
  EmptyRecordError,
  InvalidAmountError,
  InvalidCurrencyError,
} from "../../gen/prices/error.js";

export const priceBookPricesOperations: PriceBookPricesOperations = {
  recordPricesOperation(state, action) {
    if (action.input.prices.length === 0) {
      throw new EmptyRecordError(
        "A price record must carry at least one price",
      );
    }
    const isDecimal = (value: string) =>
      /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value);
    for (const price of action.input.prices) {
      if (!isDecimal(price.price)) {
        throw new InvalidAmountError(`${price.price} is not a decimal amount`);
      }
    }
    for (const price of action.input.prices) {
      const latest = state.latest.find((p) => p.asset === price.asset);
      if (latest) {
        latest.price = price.price;
        latest.source = price.source;
        latest.fetchedAt = action.input.fetchedAt;
      } else {
        state.latest.push({
          asset: price.asset,
          price: price.price,
          source: price.source,
          fetchedAt: action.input.fetchedAt,
        });
      }
      const point = state.history.find(
        (h) => h.asset === price.asset && h.hour === action.input.hour,
      );
      if (point) {
        point.price = price.price;
        point.source = price.source;
      } else {
        state.history.push({
          asset: price.asset,
          hour: action.input.hour,
          price: price.price,
          source: price.source,
        });
      }
    }
    state.baseCurrency = action.input.baseCurrency;
    state.status.lastFetchAt = action.input.fetchedAt;
    state.status.lastError = null;
  },
  setBaseCurrencyOperation(state, action) {
    if (!/^[A-Z]{3}$/.test(action.input.baseCurrency)) {
      throw new InvalidCurrencyError(
        `${action.input.baseCurrency} is not a 3-letter currency code`,
      );
    }
    if (action.input.baseCurrency !== state.baseCurrency) {
      // Prices stored in another currency carry no meaning here.
      state.latest = [];
      state.history = [];
    }
    state.baseCurrency = action.input.baseCurrency;
  },
  recordFetchErrorOperation(state, action) {
    state.status.lastFetchAt = action.input.at;
    state.status.lastError = action.input.error;
  },
};
