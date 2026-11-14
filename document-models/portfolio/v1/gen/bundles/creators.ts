/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddBundleInputSchema,
  RemoveBundleInputSchema,
  UpdateBundleInputSchema,
} from "../schema/zod.js";
import type {
  AddBundleInput,
  RemoveBundleInput,
  UpdateBundleInput,
} from "../types.js";
import type {
  AddBundleAction,
  RemoveBundleAction,
  UpdateBundleAction,
} from "./actions.js";

export const addBundle = (input: AddBundleInput) =>
  createAction<AddBundleAction>(
    "ADD_BUNDLE",
    { ...input },
    undefined,
    AddBundleInputSchema,
    "global",
  );

export const updateBundle = (input: UpdateBundleInput) =>
  createAction<UpdateBundleAction>(
    "UPDATE_BUNDLE",
    { ...input },
    undefined,
    UpdateBundleInputSchema,
    "global",
  );

export const removeBundle = (input: RemoveBundleInput) =>
  createAction<RemoveBundleAction>(
    "REMOVE_BUNDLE",
    { ...input },
    undefined,
    RemoveBundleInputSchema,
    "global",
  );
