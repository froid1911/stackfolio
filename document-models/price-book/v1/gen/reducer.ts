import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { PriceBookPHState } from "document-models/price-book/v1";
import type {
  RecordFetchErrorAction,
  RecordPricesAction,
  SetBaseCurrencyAction,
} from "./prices/actions.js";

import { priceBookPricesOperations } from "../src/reducers/prices.js";

import {
  RecordFetchErrorInputSchema,
  RecordPricesInputSchema,
  SetBaseCurrencyInputSchema,
} from "./schema/zod.js";

const schemaMemo = new Map<() => unknown, unknown>();

function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = schemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    schemaMemo.set(makeSchema, schema);
  }
  return schema;
}

const stateReducer: StateReducer<PriceBookPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "RECORD_PRICES": {
      memoizedSchema(RecordPricesInputSchema).parse(action.input);

      priceBookPricesOperations.recordPricesOperation(
        state.global,
        action as RecordPricesAction,
        dispatch,
      );

      break;
    }

    case "SET_BASE_CURRENCY": {
      memoizedSchema(SetBaseCurrencyInputSchema).parse(action.input);

      priceBookPricesOperations.setBaseCurrencyOperation(
        state.global,
        action as SetBaseCurrencyAction,
        dispatch,
      );

      break;
    }

    case "RECORD_FETCH_ERROR": {
      memoizedSchema(RecordFetchErrorInputSchema).parse(action.input);

      priceBookPricesOperations.recordFetchErrorOperation(
        state.global,
        action as RecordFetchErrorAction,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<PriceBookPHState> = createReducer(stateReducer);
