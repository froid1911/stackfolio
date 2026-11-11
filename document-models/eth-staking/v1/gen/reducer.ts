import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { EthStakingPHState } from "document-models/eth-staking/v1";
import type {
  RecordBalancesAction,
  RecordStakeScanProgressAction,
  RecordWithdrawalsAction,
} from "./history/actions.js";
import type { UpsertValidatorsAction } from "./validators/actions.js";

import { ethStakingHistoryOperations } from "../src/reducers/history.js";
import { ethStakingValidatorsOperations } from "../src/reducers/validators.js";

import {
  RecordBalancesInputSchema,
  RecordStakeScanProgressInputSchema,
  RecordWithdrawalsInputSchema,
  UpsertValidatorsInputSchema,
} from "./schema/zod.js";

const schemaMemo = new Map<() => unknown, unknown>();

function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = schemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    schemaMemo.set(makeSchema, schema);
  }
  return schema;
}

const stateReducer: StateReducer<EthStakingPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "UPSERT_VALIDATORS": {
      memoizedSchema(UpsertValidatorsInputSchema).parse(action.input);

      ethStakingValidatorsOperations.upsertValidatorsOperation(
        state.global,
        action as UpsertValidatorsAction,
        dispatch,
      );

      break;
    }

    case "RECORD_BALANCES": {
      memoizedSchema(RecordBalancesInputSchema).parse(action.input);

      ethStakingHistoryOperations.recordBalancesOperation(
        state.global,
        action as RecordBalancesAction,
        dispatch,
      );

      break;
    }

    case "RECORD_WITHDRAWALS": {
      memoizedSchema(RecordWithdrawalsInputSchema).parse(action.input);

      ethStakingHistoryOperations.recordWithdrawalsOperation(
        state.global,
        action as RecordWithdrawalsAction,
        dispatch,
      );

      break;
    }

    case "RECORD_STAKE_SCAN_PROGRESS": {
      memoizedSchema(RecordStakeScanProgressInputSchema).parse(action.input);

      ethStakingHistoryOperations.recordStakeScanProgressOperation(
        state.global,
        action as RecordStakeScanProgressAction,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<EthStakingPHState> = createReducer(stateReducer);
