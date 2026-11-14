/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddCategoryRuleInputSchema,
  ClearEventCategoriesInputSchema,
  RemoveCategoryRuleInputSchema,
  SetAssetTrustedInputSchema,
  SetEventCategoriesInputSchema,
  UpdateCategoryRuleInputSchema,
} from "../schema/zod.js";
import type {
  AddCategoryRuleInput,
  ClearEventCategoriesInput,
  RemoveCategoryRuleInput,
  SetAssetTrustedInput,
  SetEventCategoriesInput,
  UpdateCategoryRuleInput,
} from "../types.js";
import type {
  AddCategoryRuleAction,
  ClearEventCategoriesAction,
  RemoveCategoryRuleAction,
  SetAssetTrustedAction,
  SetEventCategoriesAction,
  UpdateCategoryRuleAction,
} from "./actions.js";

export const addCategoryRule = (input: AddCategoryRuleInput) =>
  createAction<AddCategoryRuleAction>(
    "ADD_CATEGORY_RULE",
    { ...input },
    undefined,
    AddCategoryRuleInputSchema,
    "global",
  );

export const updateCategoryRule = (input: UpdateCategoryRuleInput) =>
  createAction<UpdateCategoryRuleAction>(
    "UPDATE_CATEGORY_RULE",
    { ...input },
    undefined,
    UpdateCategoryRuleInputSchema,
    "global",
  );

export const removeCategoryRule = (input: RemoveCategoryRuleInput) =>
  createAction<RemoveCategoryRuleAction>(
    "REMOVE_CATEGORY_RULE",
    { ...input },
    undefined,
    RemoveCategoryRuleInputSchema,
    "global",
  );

export const setEventCategories = (input: SetEventCategoriesInput) =>
  createAction<SetEventCategoriesAction>(
    "SET_EVENT_CATEGORIES",
    { ...input },
    undefined,
    SetEventCategoriesInputSchema,
    "global",
  );

export const clearEventCategories = (input: ClearEventCategoriesInput) =>
  createAction<ClearEventCategoriesAction>(
    "CLEAR_EVENT_CATEGORIES",
    { ...input },
    undefined,
    ClearEventCategoriesInputSchema,
    "global",
  );

export const setAssetTrusted = (input: SetAssetTrustedInput) =>
  createAction<SetAssetTrustedAction>(
    "SET_ASSET_TRUSTED",
    { ...input },
    undefined,
    SetAssetTrustedInputSchema,
    "global",
  );
