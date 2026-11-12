/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { EthStakingGlobalState } from "../types.js";
import type {
  RemoveValidatorsAction,
  UpsertValidatorsAction,
} from "./actions.js";

export interface EthStakingValidatorsOperations {
  upsertValidatorsOperation: (
    state: EthStakingGlobalState,
    action: UpsertValidatorsAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeValidatorsOperation: (
    state: EthStakingGlobalState,
    action: RemoveValidatorsAction,
    dispatch?: SignalDispatch,
  ) => void;
}
