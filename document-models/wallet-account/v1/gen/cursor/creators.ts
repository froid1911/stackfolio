/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RecordScanProgressInputSchema,
  SetBackfillStateInputSchema,
  SetNativeBalanceInputSchema,
} from "../schema/zod.js";
import type {
  RecordScanProgressInput,
  SetBackfillStateInput,
  SetNativeBalanceInput,
} from "../types.js";
import type {
  RecordScanProgressAction,
  SetBackfillStateAction,
  SetNativeBalanceAction,
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
