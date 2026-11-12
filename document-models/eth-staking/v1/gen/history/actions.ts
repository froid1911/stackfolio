/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  RecordBalancesInput,
  RecordStakeScanProgressInput,
  RecordWithdrawalsInput,
} from "../types.js";

export type RecordBalancesAction = Action & {
  type: "RECORD_BALANCES";
  input: RecordBalancesInput;
};
export type RecordWithdrawalsAction = Action & {
  type: "RECORD_WITHDRAWALS";
  input: RecordWithdrawalsInput;
};
export type RecordStakeScanProgressAction = Action & {
  type: "RECORD_STAKE_SCAN_PROGRESS";
  input: RecordStakeScanProgressInput;
};

export type EthStakingHistoryAction =
  | RecordBalancesAction
  | RecordWithdrawalsAction
  | RecordStakeScanProgressAction;
