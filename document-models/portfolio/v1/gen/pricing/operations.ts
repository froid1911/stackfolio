/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PortfolioGlobalState } from "../types.js";
import type {
  RemovePriceOverrideAction,
  SetAssetIgnoredAction,
  SetPriceOverrideAction,
} from "./actions.js";

export interface PortfolioPricingOperations {
  setPriceOverrideOperation: (
    state: PortfolioGlobalState,
    action: SetPriceOverrideAction,
    dispatch?: SignalDispatch,
  ) => void;
  removePriceOverrideOperation: (
    state: PortfolioGlobalState,
    action: RemovePriceOverrideAction,
    dispatch?: SignalDispatch,
  ) => void;
  setAssetIgnoredOperation: (
    state: PortfolioGlobalState,
    action: SetAssetIgnoredAction,
    dispatch?: SignalDispatch,
  ) => void;
}
