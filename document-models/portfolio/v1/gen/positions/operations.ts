/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PortfolioGlobalState } from "../types.js";
import type { SetPositionsAction } from "./actions.js";

export interface PortfolioPositionsOperations {
  setPositionsOperation: (
    state: PortfolioGlobalState,
    action: SetPositionsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
