/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RecordSnapshotInputSchema,
  UpsertAccountInputSchema,
} from "../schema/zod.js";
import type { RecordSnapshotInput, UpsertAccountInput } from "../types.js";
import type { RecordSnapshotAction, UpsertAccountAction } from "./actions.js";

export const upsertAccount = (input: UpsertAccountInput) =>
  createAction<UpsertAccountAction>(
    "UPSERT_ACCOUNT",
    { ...input },
    undefined,
    UpsertAccountInputSchema,
    "global",
  );

export const recordSnapshot = (input: RecordSnapshotInput) =>
  createAction<RecordSnapshotAction>(
    "RECORD_SNAPSHOT",
    { ...input },
    undefined,
    RecordSnapshotInputSchema,
    "global",
  );
