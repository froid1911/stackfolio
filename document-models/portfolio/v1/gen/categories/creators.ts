/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddCategoryRuleInputSchema,
  ClearEventCategoriesInputSchema,
  RemoveCategoryRuleInputSchema,
  SetEventCategoriesInputSchema,
  UpdateCategoryRuleInputSchema,
} from "../schema/zod.js";
import type {
  AddCategoryRuleInput,
  ClearEventCategoriesInput,
  RemoveCategoryRuleInput,
  SetEventCategoriesInput,
  UpdateCategoryRuleInput,
} from "../types.js";
import type {
  AddCategoryRuleAction,
  ClearEventCategoriesAction,
  RemoveCategoryRuleAction,
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
