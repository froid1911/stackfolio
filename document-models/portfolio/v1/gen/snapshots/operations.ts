/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PortfolioGlobalState } from "../types.js";
import type { DeleteSnapshotAction, TakeSnapshotAction } from "./actions.js";

export interface PortfolioSnapshotsOperations {
  takeSnapshotOperation: (
    state: PortfolioGlobalState,
    action: TakeSnapshotAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteSnapshotOperation: (
    state: PortfolioGlobalState,
    action: DeleteSnapshotAction,
    dispatch?: SignalDispatch,
  ) => void;
}
