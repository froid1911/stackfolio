/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PortfolioGlobalState } from "../types.js";
import type {
  AddBundleAction,
  RemoveBundleAction,
  UpdateBundleAction,
} from "./actions.js";

export interface PortfolioBundlesOperations {
  addBundleOperation: (
    state: PortfolioGlobalState,
    action: AddBundleAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateBundleOperation: (
    state: PortfolioGlobalState,
    action: UpdateBundleAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeBundleOperation: (
    state: PortfolioGlobalState,
    action: RemoveBundleAction,
    dispatch?: SignalDispatch,
  ) => void;
}
