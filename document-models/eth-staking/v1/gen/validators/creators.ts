/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RemoveValidatorsInputSchema,
  UpsertValidatorsInputSchema,
} from "../schema/zod.js";
import type { RemoveValidatorsInput, UpsertValidatorsInput } from "../types.js";
import type {
  RemoveValidatorsAction,
  UpsertValidatorsAction,
} from "./actions.js";

export const upsertValidators = (input: UpsertValidatorsInput) =>
  createAction<UpsertValidatorsAction>(
    "UPSERT_VALIDATORS",
    { ...input },
    undefined,
    UpsertValidatorsInputSchema,
    "global",
  );

export const removeValidators = (input: RemoveValidatorsInput) =>
  createAction<RemoveValidatorsAction>(
    "REMOVE_VALIDATORS",
    { ...input },
    undefined,
    RemoveValidatorsInputSchema,
    "global",
  );
