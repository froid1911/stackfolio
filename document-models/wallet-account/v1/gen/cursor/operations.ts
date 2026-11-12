/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WalletAccountGlobalState } from "../types.js";
import type {
  RecordScanProgressAction,
  SetBackfillStateAction,
  SetNativeBalanceAction,
} from "./actions.js";

export interface WalletAccountCursorOperations {
  recordScanProgressOperation: (
    state: WalletAccountGlobalState,
    action: RecordScanProgressAction,
    dispatch?: SignalDispatch,
  ) => void;
  setBackfillStateOperation: (
    state: WalletAccountGlobalState,
    action: SetBackfillStateAction,
    dispatch?: SignalDispatch,
  ) => void;
  setNativeBalanceOperation: (
    state: WalletAccountGlobalState,
    action: SetNativeBalanceAction,
    dispatch?: SignalDispatch,
  ) => void;
}
