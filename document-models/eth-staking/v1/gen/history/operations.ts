/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { EthStakingGlobalState } from "../types.js";
import type {
  RecordBalancesAction,
  RecordStakeScanProgressAction,
  RecordWithdrawalsAction,
} from "./actions.js";

export interface EthStakingHistoryOperations {
  recordBalancesOperation: (
    state: EthStakingGlobalState,
    action: RecordBalancesAction,
    dispatch?: SignalDispatch,
  ) => void;
  recordWithdrawalsOperation: (
    state: EthStakingGlobalState,
    action: RecordWithdrawalsAction,
    dispatch?: SignalDispatch,
  ) => void;
  recordStakeScanProgressOperation: (
    state: EthStakingGlobalState,
    action: RecordStakeScanProgressAction,
    dispatch?: SignalDispatch,
  ) => void;
}
