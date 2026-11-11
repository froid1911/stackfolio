import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { AssetRegistryPHState } from "document-models/asset-registry/v1";
import type {
  RegisterAssetAction,
  RemoveAssetAction,
  SetCoingeckoIdAction,
  UpdateAssetAction,
} from "./registry/actions.js";

import { assetRegistryRegistryOperations } from "../src/reducers/registry.js";

import {
  RegisterAssetInputSchema,
  RemoveAssetInputSchema,
  SetCoingeckoIdInputSchema,
  UpdateAssetInputSchema,
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

const stateReducer: StateReducer<AssetRegistryPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "REGISTER_ASSET": {
      memoizedSchema(RegisterAssetInputSchema).parse(action.input);

      assetRegistryRegistryOperations.registerAssetOperation(
        state.global,
        action as RegisterAssetAction,
        dispatch,
      );

      break;
    }

    case "UPDATE_ASSET": {
      memoizedSchema(UpdateAssetInputSchema).parse(action.input);

      assetRegistryRegistryOperations.updateAssetOperation(
        state.global,
        action as UpdateAssetAction,
        dispatch,
      );

      break;
    }

    case "SET_COINGECKO_ID": {
      memoizedSchema(SetCoingeckoIdInputSchema).parse(action.input);

      assetRegistryRegistryOperations.setCoingeckoIdOperation(
        state.global,
        action as SetCoingeckoIdAction,
        dispatch,
      );

      break;
    }

    case "REMOVE_ASSET": {
      memoizedSchema(RemoveAssetInputSchema).parse(action.input);

      assetRegistryRegistryOperations.removeAssetOperation(
        state.global,
        action as RemoveAssetAction,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<AssetRegistryPHState> =
  createReducer(stateReducer);
