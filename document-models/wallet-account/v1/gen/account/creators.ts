/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  SetAccountDetailsInputSchema,
  SetIgnoredInputSchema,
} from "../schema/zod.js";
import type { SetAccountDetailsInput, SetIgnoredInput } from "../types.js";
import type { SetAccountDetailsAction, SetIgnoredAction } from "./actions.js";

export const setAccountDetails = (input: SetAccountDetailsInput) =>
  createAction<SetAccountDetailsAction>(
    "SET_ACCOUNT_DETAILS",
    { ...input },
    undefined,
    SetAccountDetailsInputSchema,
    "global",
  );

export const setIgnored = (input: SetIgnoredInput) =>
  createAction<SetIgnoredAction>(
    "SET_IGNORED",
    { ...input },
    undefined,
    SetIgnoredInputSchema,
    "global",
  );
