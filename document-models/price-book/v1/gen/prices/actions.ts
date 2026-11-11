/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  RecordFetchErrorInput,
  RecordPricesInput,
  SetBaseCurrencyInput,
} from "../types.js";

export type RecordPricesAction = Action & {
  type: "RECORD_PRICES";
  input: RecordPricesInput;
};
export type SetBaseCurrencyAction = Action & {
  type: "SET_BASE_CURRENCY";
  input: SetBaseCurrencyInput;
};
export type RecordFetchErrorAction = Action & {
  type: "RECORD_FETCH_ERROR";
  input: RecordFetchErrorInput;
};

export type PriceBookPricesAction =
  | RecordPricesAction
  | SetBaseCurrencyAction
  | RecordFetchErrorAction;
