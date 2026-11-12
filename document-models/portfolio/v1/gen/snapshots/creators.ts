/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  DeleteSnapshotInputSchema,
  TakeSnapshotInputSchema,
} from "../schema/zod.js";
import type { DeleteSnapshotInput, TakeSnapshotInput } from "../types.js";
import type { DeleteSnapshotAction, TakeSnapshotAction } from "./actions.js";

export const takeSnapshot = (input: TakeSnapshotInput) =>
  createAction<TakeSnapshotAction>(
    "TAKE_SNAPSHOT",
    { ...input },
    undefined,
    TakeSnapshotInputSchema,
    "global",
  );

export const deleteSnapshot = (input: DeleteSnapshotInput) =>
  createAction<DeleteSnapshotAction>(
    "DELETE_SNAPSHOT",
    { ...input },
    undefined,
    DeleteSnapshotInputSchema,
    "global",
  );
