/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RecordScanProgressInputSchema,
  SetBackfillStateInputSchema,
  SetNativeBalanceInputSchema,
  SetRedecodeStateInputSchema,
  SetTokenBalancesInputSchema,
} from "../schema/zod.js";
import type {
  RecordScanProgressInput,
  SetBackfillStateInput,
  SetNativeBalanceInput,
  SetRedecodeStateInput,
  SetTokenBalancesInput,
} from "../types.js";
import type {
  RecordScanProgressAction,
  SetBackfillStateAction,
  SetNativeBalanceAction,
  SetRedecodeStateAction,
  SetTokenBalancesAction,
} from "./actions.js";

export const recordScanProgress = (input: RecordScanProgressInput) =>
  createAction<RecordScanProgressAction>(
    "RECORD_SCAN_PROGRESS",
    { ...input },
    undefined,
    RecordScanProgressInputSchema,
    "global",
  );

export const setBackfillState = (input: SetBackfillStateInput) =>
  createAction<SetBackfillStateAction>(
    "SET_BACKFILL_STATE",
    { ...input },
    undefined,
    SetBackfillStateInputSchema,
    "global",
  );

export const setNativeBalance = (input: SetNativeBalanceInput) =>
  createAction<SetNativeBalanceAction>(
    "SET_NATIVE_BALANCE",
    { ...input },
    undefined,
    SetNativeBalanceInputSchema,
    "global",
  );

export const setRedecodeState = (input: SetRedecodeStateInput) =>
  createAction<SetRedecodeStateAction>(
    "SET_REDECODE_STATE",
    { ...input },
    undefined,
    SetRedecodeStateInputSchema,
    "global",
  );

export const setTokenBalances = (input: SetTokenBalancesInput) =>
  createAction<SetTokenBalancesAction>(
    "SET_TOKEN_BALANCES",
    { ...input },
    undefined,
    SetTokenBalancesInputSchema,
    "global",
  );
