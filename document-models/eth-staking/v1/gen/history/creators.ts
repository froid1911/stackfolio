/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RecordBalancesInputSchema,
  RecordStakeScanProgressInputSchema,
  RecordWithdrawalsInputSchema,
} from "../schema/zod.js";
import type {
  RecordBalancesInput,
  RecordStakeScanProgressInput,
  RecordWithdrawalsInput,
} from "../types.js";
import type {
  RecordBalancesAction,
  RecordStakeScanProgressAction,
  RecordWithdrawalsAction,
} from "./actions.js";

export const recordBalances = (input: RecordBalancesInput) =>
  createAction<RecordBalancesAction>(
    "RECORD_BALANCES",
    { ...input },
    undefined,
    RecordBalancesInputSchema,
    "global",
  );

export const recordWithdrawals = (input: RecordWithdrawalsInput) =>
  createAction<RecordWithdrawalsAction>(
    "RECORD_WITHDRAWALS",
    { ...input },
    undefined,
    RecordWithdrawalsInputSchema,
    "global",
  );

export const recordStakeScanProgress = (input: RecordStakeScanProgressInput) =>
  createAction<RecordStakeScanProgressAction>(
    "RECORD_STAKE_SCAN_PROGRESS",
    { ...input },
    undefined,
    RecordStakeScanProgressInputSchema,
    "global",
  );
