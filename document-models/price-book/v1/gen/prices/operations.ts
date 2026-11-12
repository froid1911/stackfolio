/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PriceBookGlobalState } from "../types.js";
import type {
  RecordFetchErrorAction,
  RecordPricesAction,
  SetBaseCurrencyAction,
} from "./actions.js";

export interface PriceBookPricesOperations {
  recordPricesOperation: (
    state: PriceBookGlobalState,
    action: RecordPricesAction,
    dispatch?: SignalDispatch,
  ) => void;
  setBaseCurrencyOperation: (
    state: PriceBookGlobalState,
    action: SetBaseCurrencyAction,
    dispatch?: SignalDispatch,
  ) => void;
  recordFetchErrorOperation: (
    state: PriceBookGlobalState,
    action: RecordFetchErrorAction,
    dispatch?: SignalDispatch,
  ) => void;
}
