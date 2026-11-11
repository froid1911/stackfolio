/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RecordFetchErrorInputSchema,
  RecordPricesInputSchema,
  SetBaseCurrencyInputSchema,
} from "../schema/zod.js";
import type {
  RecordFetchErrorInput,
  RecordPricesInput,
  SetBaseCurrencyInput,
} from "../types.js";
import type {
  RecordFetchErrorAction,
  RecordPricesAction,
  SetBaseCurrencyAction,
} from "./actions.js";

export const recordPrices = (input: RecordPricesInput) =>
  createAction<RecordPricesAction>(
    "RECORD_PRICES",
    { ...input },
    undefined,
    RecordPricesInputSchema,
    "global",
  );

export const setBaseCurrency = (input: SetBaseCurrencyInput) =>
  createAction<SetBaseCurrencyAction>(
    "SET_BASE_CURRENCY",
    { ...input },
    undefined,
    SetBaseCurrencyInputSchema,
    "global",
  );

export const recordFetchError = (input: RecordFetchErrorInput) =>
  createAction<RecordFetchErrorAction>(
    "RECORD_FETCH_ERROR",
    { ...input },
    undefined,
    RecordFetchErrorInputSchema,
    "global",
  );
