/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RetypeEventInputSchema,
  SetEventIgnoredInputSchema,
  SetEventNotesInputSchema,
} from "../schema/zod.js";
import type {
  RetypeEventInput,
  SetEventIgnoredInput,
  SetEventNotesInput,
} from "../types.js";
import type {
  RetypeEventAction,
  SetEventIgnoredAction,
  SetEventNotesAction,
} from "./actions.js";

export const setEventIgnored = (input: SetEventIgnoredInput) =>
  createAction<SetEventIgnoredAction>(
    "SET_EVENT_IGNORED",
    { ...input },
    undefined,
    SetEventIgnoredInputSchema,
    "global",
  );

export const setEventNotes = (input: SetEventNotesInput) =>
  createAction<SetEventNotesAction>(
    "SET_EVENT_NOTES",
    { ...input },
    undefined,
    SetEventNotesInputSchema,
    "global",
  );

export const retypeEvent = (input: RetypeEventInput) =>
  createAction<RetypeEventAction>(
    "RETYPE_EVENT",
    { ...input },
    undefined,
    RetypeEventInputSchema,
    "global",
  );
