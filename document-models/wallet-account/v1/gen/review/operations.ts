/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { WalletAccountGlobalState } from "../types.js";
import type {
  PinValuationsAction,
  RetypeEventAction,
  SetEventIgnoredAction,
  SetEventNotesAction,
} from "./actions.js";

export interface WalletAccountReviewOperations {
  setEventIgnoredOperation: (
    state: WalletAccountGlobalState,
    action: SetEventIgnoredAction,
    dispatch?: SignalDispatch,
  ) => void;
  setEventNotesOperation: (
    state: WalletAccountGlobalState,
    action: SetEventNotesAction,
    dispatch?: SignalDispatch,
  ) => void;
  retypeEventOperation: (
    state: WalletAccountGlobalState,
    action: RetypeEventAction,
    dispatch?: SignalDispatch,
  ) => void;
  pinValuationsOperation: (
    state: WalletAccountGlobalState,
    action: PinValuationsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
