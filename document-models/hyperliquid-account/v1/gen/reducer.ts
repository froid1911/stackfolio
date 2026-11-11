import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { HyperliquidAccountPHState } from "document-models/hyperliquid-account/v1";
import type {
  RecordSnapshotAction,
  UpsertAccountAction,
} from "./hyperliquid/actions.js";

import { hyperliquidAccountHyperliquidOperations } from "../src/reducers/hyperliquid.js";

import {
  RecordSnapshotInputSchema,
  UpsertAccountInputSchema,
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

const stateReducer: StateReducer<HyperliquidAccountPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "UPSERT_ACCOUNT": {
      memoizedSchema(UpsertAccountInputSchema).parse(action.input);

      hyperliquidAccountHyperliquidOperations.upsertAccountOperation(
        state.global,
        action as UpsertAccountAction,
        dispatch,
      );

      break;
    }

    case "RECORD_SNAPSHOT": {
      memoizedSchema(RecordSnapshotInputSchema).parse(action.input);

      hyperliquidAccountHyperliquidOperations.recordSnapshotOperation(
        state.global,
        action as RecordSnapshotAction,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<HyperliquidAccountPHState> =
  createReducer(stateReducer);
