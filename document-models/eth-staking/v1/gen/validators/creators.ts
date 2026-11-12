/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { UpsertValidatorsInputSchema } from "../schema/zod.js";
import type { UpsertValidatorsInput } from "../types.js";
import type { UpsertValidatorsAction } from "./actions.js";

export const upsertValidators = (input: UpsertValidatorsInput) =>
  createAction<UpsertValidatorsAction>(
    "UPSERT_VALIDATORS",
    { ...input },
    undefined,
    UpsertValidatorsInputSchema,
    "global",
  );
