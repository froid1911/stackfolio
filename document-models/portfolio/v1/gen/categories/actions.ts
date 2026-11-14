/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddCategoryRuleInput,
  ClearEventCategoriesInput,
  RemoveCategoryRuleInput,
  SetAssetTrustedInput,
  SetEventCategoriesInput,
  UpdateCategoryRuleInput,
} from "../types.js";

export type AddCategoryRuleAction = Action & {
  type: "ADD_CATEGORY_RULE";
  input: AddCategoryRuleInput;
};
export type UpdateCategoryRuleAction = Action & {
  type: "UPDATE_CATEGORY_RULE";
  input: UpdateCategoryRuleInput;
};
export type RemoveCategoryRuleAction = Action & {
  type: "REMOVE_CATEGORY_RULE";
  input: RemoveCategoryRuleInput;
};
export type SetEventCategoriesAction = Action & {
  type: "SET_EVENT_CATEGORIES";
  input: SetEventCategoriesInput;
};
export type ClearEventCategoriesAction = Action & {
  type: "CLEAR_EVENT_CATEGORIES";
  input: ClearEventCategoriesInput;
};
export type SetAssetTrustedAction = Action & {
  type: "SET_ASSET_TRUSTED";
  input: SetAssetTrustedInput;
};

export type PortfolioCategoriesAction =
  | AddCategoryRuleAction
  | UpdateCategoryRuleAction
  | RemoveCategoryRuleAction
  | SetEventCategoriesAction
  | ClearEventCategoriesAction
  | SetAssetTrustedAction;
