/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { SetPositionsInputSchema } from "../schema/zod.js";
import type { SetPositionsInput } from "../types.js";
import type { SetPositionsAction } from "./actions.js";

export const setPositions = (input: SetPositionsInput) =>
  createAction<SetPositionsAction>(
    "SET_POSITIONS",
    { ...input },
    undefined,
    SetPositionsInputSchema,
    "global",
  );
