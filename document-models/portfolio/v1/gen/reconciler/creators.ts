/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearGrantInputSchema,
  RecordCheckInputSchema,
  RecordResourcesInputSchema,
  SetGrantInputSchema,
} from "../schema/zod.js";
import type {
  ClearGrantInput,
  RecordCheckInput,
  RecordResourcesInput,
  SetGrantInput,
} from "../types.js";
import type {
  ClearGrantAction,
  RecordCheckAction,
  RecordResourcesAction,
  SetGrantAction,
} from "./actions.js";

export const recordResources = (input: RecordResourcesInput) =>
  createAction<RecordResourcesAction>(
    "RECORD_RESOURCES",
    { ...input },
    undefined,
    RecordResourcesInputSchema,
    "global",
  );

export const recordCheck = (input: RecordCheckInput) =>
  createAction<RecordCheckAction>(
    "RECORD_CHECK",
    { ...input },
    undefined,
    RecordCheckInputSchema,
    "global",
  );

export const setGrant = (input: SetGrantInput) =>
  createAction<SetGrantAction>(
    "SET_GRANT",
    { ...input },
    undefined,
    SetGrantInputSchema,
    "global",
  );

export const clearGrant = (input: ClearGrantInput = {}) =>
  createAction<ClearGrantAction>(
    "CLEAR_GRANT",
    { ...input },
    undefined,
    ClearGrantInputSchema,
    "global",
  );
