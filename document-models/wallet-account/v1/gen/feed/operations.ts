/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WalletAccountGlobalState } from "../types.js";
import type { ImportEventsAction } from "./actions.js";

export interface WalletAccountFeedOperations {
  importEventsOperation: (
    state: WalletAccountGlobalState,
    action: ImportEventsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
