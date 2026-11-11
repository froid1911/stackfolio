/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PortfolioGlobalState } from "../types.js";
import type {
  ClearGrantAction,
  RecordCheckAction,
  RecordResourcesAction,
  SetGrantAction,
} from "./actions.js";

export interface PortfolioReconcilerOperations {
  recordResourcesOperation: (
    state: PortfolioGlobalState,
    action: RecordResourcesAction,
    dispatch?: SignalDispatch,
  ) => void;
  recordCheckOperation: (
    state: PortfolioGlobalState,
    action: RecordCheckAction,
    dispatch?: SignalDispatch,
  ) => void;
  setGrantOperation: (
    state: PortfolioGlobalState,
    action: SetGrantAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearGrantOperation: (
    state: PortfolioGlobalState,
    action: ClearGrantAction,
    dispatch?: SignalDispatch,
  ) => void;
}
