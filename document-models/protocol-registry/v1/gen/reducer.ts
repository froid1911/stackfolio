import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { ProtocolRegistryPHState } from "document-models/protocol-registry/v1";
import type {
  RegisterProtocolAction,
  RetireProtocolAction,
  UpdateProtocolAction,
} from "./registry/actions.js";

import { protocolRegistryRegistryOperations } from "../src/reducers/registry.js";

import {
  RegisterProtocolInputSchema,
  RetireProtocolInputSchema,
  UpdateProtocolInputSchema,
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

const stateReducer: StateReducer<ProtocolRegistryPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "REGISTER_PROTOCOL": {
      memoizedSchema(RegisterProtocolInputSchema).parse(action.input);

      protocolRegistryRegistryOperations.registerProtocolOperation(
        state.global,
        action as RegisterProtocolAction,
        dispatch,
      );

      break;
    }

    case "UPDATE_PROTOCOL": {
      memoizedSchema(UpdateProtocolInputSchema).parse(action.input);

      protocolRegistryRegistryOperations.updateProtocolOperation(
        state.global,
        action as UpdateProtocolAction,
        dispatch,
      );

      break;
    }

    case "RETIRE_PROTOCOL": {
      memoizedSchema(RetireProtocolInputSchema).parse(action.input);

      protocolRegistryRegistryOperations.retireProtocolOperation(
        state.global,
        action as RetireProtocolAction,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<ProtocolRegistryPHState> =
  createReducer(stateReducer);
