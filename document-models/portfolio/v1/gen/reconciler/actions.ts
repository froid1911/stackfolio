/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ClearGrantInput,
  RecordCheckInput,
  RecordResourcesInput,
  SetGrantInput,
} from "../types.js";

export type RecordResourcesAction = Action & {
  type: "RECORD_RESOURCES";
  input: RecordResourcesInput;
};
export type RecordCheckAction = Action & {
  type: "RECORD_CHECK";
  input: RecordCheckInput;
};
export type SetGrantAction = Action & {
  type: "SET_GRANT";
  input: SetGrantInput;
};
export type ClearGrantAction = Action & {
  type: "CLEAR_GRANT";
  input: ClearGrantInput;
};

export type PortfolioReconcilerAction =
  | RecordResourcesAction
  | RecordCheckAction
  | SetGrantAction
  | ClearGrantAction;
