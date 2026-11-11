/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  RecordScanProgressInput,
  SetBackfillStateInput,
  SetNativeBalanceInput,
} from "../types.js";

export type RecordScanProgressAction = Action & {
  type: "RECORD_SCAN_PROGRESS";
  input: RecordScanProgressInput;
};
export type SetBackfillStateAction = Action & {
  type: "SET_BACKFILL_STATE";
  input: SetBackfillStateInput;
};
export type SetNativeBalanceAction = Action & {
  type: "SET_NATIVE_BALANCE";
  input: SetNativeBalanceInput;
};

export type WalletAccountCursorAction =
  | RecordScanProgressAction
  | SetBackfillStateAction
  | SetNativeBalanceAction;
