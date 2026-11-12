/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ImportEventsInputSchema,
  ReplaceEventsInputSchema,
} from "../schema/zod.js";
import type { ImportEventsInput, ReplaceEventsInput } from "../types.js";
import type { ImportEventsAction, ReplaceEventsAction } from "./actions.js";

export const importEvents = (input: ImportEventsInput) =>
  createAction<ImportEventsAction>(
    "IMPORT_EVENTS",
    { ...input },
    undefined,
    ImportEventsInputSchema,
    "global",
  );

export const replaceEvents = (input: ReplaceEventsInput) =>
  createAction<ReplaceEventsAction>(
    "REPLACE_EVENTS",
    { ...input },
    undefined,
    ReplaceEventsInputSchema,
    "global",
  );
