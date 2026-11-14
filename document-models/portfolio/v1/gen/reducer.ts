import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { PortfolioPHState } from "document-models/portfolio/v1";
import type {
  AddAddressAction,
  RemoveAddressAction,
  SetAddressIgnoredAction,
  UpdateAddressAction,
} from "./address-book/actions.js";
import type {
  AddBundleAction,
  RemoveBundleAction,
  UpdateBundleAction,
} from "./bundles/actions.js";
import type { SetPortfolioDetailsAction } from "./identity/actions.js";
import type { SetPositionsAction } from "./positions/actions.js";
import type {
  RemovePriceOverrideAction,
  SetAssetIgnoredAction,
  SetPriceOverrideAction,
} from "./pricing/actions.js";
import type {
  ClearGrantAction,
  RecordCheckAction,
  RecordResourcesAction,
  SetGrantAction,
} from "./reconciler/actions.js";
import type {
  DeleteSnapshotAction,
  TakeSnapshotAction,
} from "./snapshots/actions.js";

import { portfolioAddressBookOperations } from "../src/reducers/address-book.js";
import { portfolioBundlesOperations } from "../src/reducers/bundles.js";
import { portfolioIdentityOperations } from "../src/reducers/identity.js";
import { portfolioPositionsOperations } from "../src/reducers/positions.js";
import { portfolioPricingOperations } from "../src/reducers/pricing.js";
import { portfolioReconcilerOperations } from "../src/reducers/reconciler.js";
import { portfolioSnapshotsOperations } from "../src/reducers/snapshots.js";

import {
  AddAddressInputSchema,
  AddBundleInputSchema,
  ClearGrantInputSchema,
  DeleteSnapshotInputSchema,
  RecordCheckInputSchema,
  RecordResourcesInputSchema,
  RemoveAddressInputSchema,
  RemoveBundleInputSchema,
  RemovePriceOverrideInputSchema,
  SetAddressIgnoredInputSchema,
  SetAssetIgnoredInputSchema,
  SetGrantInputSchema,
  SetPortfolioDetailsInputSchema,
  SetPositionsInputSchema,
  SetPriceOverrideInputSchema,
  TakeSnapshotInputSchema,
  UpdateAddressInputSchema,
  UpdateBundleInputSchema,
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

const stateReducer: StateReducer<PortfolioPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_PORTFOLIO_DETAILS": {
      memoizedSchema(SetPortfolioDetailsInputSchema).parse(action.input);

      portfolioIdentityOperations.setPortfolioDetailsOperation(
        state.global,
        action as SetPortfolioDetailsAction,
        dispatch,
      );

      break;
    }

    case "ADD_ADDRESS": {
      memoizedSchema(AddAddressInputSchema).parse(action.input);

      portfolioAddressBookOperations.addAddressOperation(
        state.global,
        action as AddAddressAction,
        dispatch,
      );

      break;
    }

    case "UPDATE_ADDRESS": {
      memoizedSchema(UpdateAddressInputSchema).parse(action.input);

      portfolioAddressBookOperations.updateAddressOperation(
        state.global,
        action as UpdateAddressAction,
        dispatch,
      );

      break;
    }

    case "REMOVE_ADDRESS": {
      memoizedSchema(RemoveAddressInputSchema).parse(action.input);

      portfolioAddressBookOperations.removeAddressOperation(
        state.global,
        action as RemoveAddressAction,
        dispatch,
      );

      break;
    }

    case "SET_ADDRESS_IGNORED": {
      memoizedSchema(SetAddressIgnoredInputSchema).parse(action.input);

      portfolioAddressBookOperations.setAddressIgnoredOperation(
        state.global,
        action as SetAddressIgnoredAction,
        dispatch,
      );

      break;
    }

    case "SET_PRICE_OVERRIDE": {
      memoizedSchema(SetPriceOverrideInputSchema).parse(action.input);

      portfolioPricingOperations.setPriceOverrideOperation(
        state.global,
        action as SetPriceOverrideAction,
        dispatch,
      );

      break;
    }

    case "REMOVE_PRICE_OVERRIDE": {
      memoizedSchema(RemovePriceOverrideInputSchema).parse(action.input);

      portfolioPricingOperations.removePriceOverrideOperation(
        state.global,
        action as RemovePriceOverrideAction,
        dispatch,
      );

      break;
    }

    case "SET_ASSET_IGNORED": {
      memoizedSchema(SetAssetIgnoredInputSchema).parse(action.input);

      portfolioPricingOperations.setAssetIgnoredOperation(
        state.global,
        action as SetAssetIgnoredAction,
        dispatch,
      );

      break;
    }

    case "TAKE_SNAPSHOT": {
      memoizedSchema(TakeSnapshotInputSchema).parse(action.input);

      portfolioSnapshotsOperations.takeSnapshotOperation(
        state.global,
        action as TakeSnapshotAction,
        dispatch,
      );

      break;
    }

    case "DELETE_SNAPSHOT": {
      memoizedSchema(DeleteSnapshotInputSchema).parse(action.input);

      portfolioSnapshotsOperations.deleteSnapshotOperation(
        state.global,
        action as DeleteSnapshotAction,
        dispatch,
      );

      break;
    }

    case "RECORD_RESOURCES": {
      memoizedSchema(RecordResourcesInputSchema).parse(action.input);

      portfolioReconcilerOperations.recordResourcesOperation(
        state.global,
        action as RecordResourcesAction,
        dispatch,
      );

      break;
    }

    case "RECORD_CHECK": {
      memoizedSchema(RecordCheckInputSchema).parse(action.input);

      portfolioReconcilerOperations.recordCheckOperation(
        state.global,
        action as RecordCheckAction,
        dispatch,
      );

      break;
    }

    case "SET_GRANT": {
      memoizedSchema(SetGrantInputSchema).parse(action.input);

      portfolioReconcilerOperations.setGrantOperation(
        state.global,
        action as SetGrantAction,
        dispatch,
      );

      break;
    }

    case "CLEAR_GRANT": {
      memoizedSchema(ClearGrantInputSchema).parse(action.input);

      portfolioReconcilerOperations.clearGrantOperation(
        state.global,
        action as ClearGrantAction,
        dispatch,
      );

      break;
    }

    case "SET_POSITIONS": {
      memoizedSchema(SetPositionsInputSchema).parse(action.input);

      portfolioPositionsOperations.setPositionsOperation(
        state.global,
        action as SetPositionsAction,
        dispatch,
      );

      break;
    }

    case "ADD_BUNDLE": {
      memoizedSchema(AddBundleInputSchema).parse(action.input);

      portfolioBundlesOperations.addBundleOperation(
        state.global,
        action as AddBundleAction,
        dispatch,
      );

      break;
    }

    case "UPDATE_BUNDLE": {
      memoizedSchema(UpdateBundleInputSchema).parse(action.input);

      portfolioBundlesOperations.updateBundleOperation(
        state.global,
        action as UpdateBundleAction,
        dispatch,
      );

      break;
    }

    case "REMOVE_BUNDLE": {
      memoizedSchema(RemoveBundleInputSchema).parse(action.input);

      portfolioBundlesOperations.removeBundleOperation(
        state.global,
        action as RemoveBundleAction,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<PortfolioPHState> = createReducer(stateReducer);
