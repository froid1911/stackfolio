/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PortfolioGlobalState } from "../types.js";
import type {
  AddCategoryRuleAction,
  ClearEventCategoriesAction,
  RemoveCategoryRuleAction,
  SetEventCategoriesAction,
  UpdateCategoryRuleAction,
} from "./actions.js";

export interface PortfolioCategoriesOperations {
  addCategoryRuleOperation: (
    state: PortfolioGlobalState,
    action: AddCategoryRuleAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateCategoryRuleOperation: (
    state: PortfolioGlobalState,
    action: UpdateCategoryRuleAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeCategoryRuleOperation: (
    state: PortfolioGlobalState,
    action: RemoveCategoryRuleAction,
    dispatch?: SignalDispatch,
  ) => void;
  setEventCategoriesOperation: (
    state: PortfolioGlobalState,
    action: SetEventCategoriesAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearEventCategoriesOperation: (
    state: PortfolioGlobalState,
    action: ClearEventCategoriesAction,
    dispatch?: SignalDispatch,
  ) => void;
}
