/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { DeleteSnapshotInput, TakeSnapshotInput } from "../types.js";

export type TakeSnapshotAction = Action & {
  type: "TAKE_SNAPSHOT";
  input: TakeSnapshotInput;
};
export type DeleteSnapshotAction = Action & {
  type: "DELETE_SNAPSHOT";
  input: DeleteSnapshotInput;
};

export type PortfolioSnapshotsAction =
  | TakeSnapshotAction
  | DeleteSnapshotAction;
