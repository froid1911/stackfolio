/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { RecordSnapshotInput, UpsertAccountInput } from "../types.js";

export type UpsertAccountAction = Action & {
  type: "UPSERT_ACCOUNT";
  input: UpsertAccountInput;
};
export type RecordSnapshotAction = Action & {
  type: "RECORD_SNAPSHOT";
  input: RecordSnapshotInput;
};

export type HyperliquidAccountHyperliquidAction =
  | UpsertAccountAction
  | RecordSnapshotAction;
