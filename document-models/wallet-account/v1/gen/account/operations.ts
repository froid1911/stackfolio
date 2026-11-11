/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WalletAccountGlobalState } from "../types.js";
import type { SetAccountDetailsAction, SetIgnoredAction } from "./actions.js";

export interface WalletAccountAccountOperations {
  setAccountDetailsOperation: (
    state: WalletAccountGlobalState,
    action: SetAccountDetailsAction,
    dispatch?: SignalDispatch,
  ) => void;
  setIgnoredOperation: (
    state: WalletAccountGlobalState,
    action: SetIgnoredAction,
    dispatch?: SignalDispatch,
  ) => void;
}
