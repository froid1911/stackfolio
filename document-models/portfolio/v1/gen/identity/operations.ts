/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PortfolioGlobalState } from "../types.js";
import type { SetPortfolioDetailsAction } from "./actions.js";

export interface PortfolioIdentityOperations {
  setPortfolioDetailsOperation: (
    state: PortfolioGlobalState,
    action: SetPortfolioDetailsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
