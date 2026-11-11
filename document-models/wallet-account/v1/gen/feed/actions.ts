/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { ImportEventsInput } from "../types.js";

export type ImportEventsAction = Action & {
  type: "IMPORT_EVENTS";
  input: ImportEventsInput;
};

export type WalletAccountFeedAction = ImportEventsAction;
