/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { ImportEventsInputSchema } from "../schema/zod.js";
import type { ImportEventsInput } from "../types.js";
import type { ImportEventsAction } from "./actions.js";

export const importEvents = (input: ImportEventsInput) =>
  createAction<ImportEventsAction>(
    "IMPORT_EVENTS",
    { ...input },
    undefined,
    ImportEventsInputSchema,
    "global",
  );
