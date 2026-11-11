/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { HyperliquidAccountGlobalState } from "../types.js";
import type { RecordSnapshotAction, UpsertAccountAction } from "./actions.js";

export interface HyperliquidAccountHyperliquidOperations {
  upsertAccountOperation: (
    state: HyperliquidAccountGlobalState,
    action: UpsertAccountAction,
    dispatch?: SignalDispatch,
  ) => void;
  recordSnapshotOperation: (
    state: HyperliquidAccountGlobalState,
    action: RecordSnapshotAction,
    dispatch?: SignalDispatch,
  ) => void;
}
