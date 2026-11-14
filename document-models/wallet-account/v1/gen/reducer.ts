import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { WalletAccountPHState } from "document-models/wallet-account/v1";
import type {
  SetAccountDetailsAction,
  SetEnsNamesAction,
  SetIgnoredAction,
  SetWalletXpubAction,
} from "./account/actions.js";
import type {
  RecordScanProgressAction,
  SetBackfillStateAction,
  SetNativeBalanceAction,
  SetRedecodeStateAction,
  SetTokenBalancesAction,
} from "./cursor/actions.js";
import type {
  ImportEventsAction,
  ReplaceEventsAction,
} from "./feed/actions.js";
import type {
  PinValuationsAction,
  RetypeEventAction,
  SetEventIgnoredAction,
  SetEventNotesAction,
} from "./review/actions.js";

import { walletAccountAccountOperations } from "../src/reducers/account.js";
import { walletAccountCursorOperations } from "../src/reducers/cursor.js";
import { walletAccountFeedOperations } from "../src/reducers/feed.js";
import { walletAccountReviewOperations } from "../src/reducers/review.js";

import {
  ImportEventsInputSchema,
  PinValuationsInputSchema,
  RecordScanProgressInputSchema,
  ReplaceEventsInputSchema,
  RetypeEventInputSchema,
  SetAccountDetailsInputSchema,
  SetBackfillStateInputSchema,
  SetEnsNamesInputSchema,
  SetEventIgnoredInputSchema,
  SetEventNotesInputSchema,
  SetIgnoredInputSchema,
  SetNativeBalanceInputSchema,
  SetRedecodeStateInputSchema,
  SetTokenBalancesInputSchema,
  SetWalletXpubInputSchema,
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

const stateReducer: StateReducer<WalletAccountPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_ACCOUNT_DETAILS": {
      memoizedSchema(SetAccountDetailsInputSchema).parse(action.input);

      walletAccountAccountOperations.setAccountDetailsOperation(
        state.global,
        action as SetAccountDetailsAction,
        dispatch,
      );

      break;
    }

    case "SET_IGNORED": {
      memoizedSchema(SetIgnoredInputSchema).parse(action.input);

      walletAccountAccountOperations.setIgnoredOperation(
        state.global,
        action as SetIgnoredAction,
        dispatch,
      );

      break;
    }

    case "SET_WALLET_XPUB": {
      memoizedSchema(SetWalletXpubInputSchema).parse(action.input);

      walletAccountAccountOperations.setWalletXpubOperation(
        state.global,
        action as SetWalletXpubAction,
        dispatch,
      );

      break;
    }

    case "SET_ENS_NAMES": {
      memoizedSchema(SetEnsNamesInputSchema).parse(action.input);

      walletAccountAccountOperations.setEnsNamesOperation(
        state.global,
        action as SetEnsNamesAction,
        dispatch,
      );

      break;
    }

    case "IMPORT_EVENTS": {
      memoizedSchema(ImportEventsInputSchema).parse(action.input);

      walletAccountFeedOperations.importEventsOperation(
        state.global,
        action as ImportEventsAction,
        dispatch,
      );

      break;
    }

    case "REPLACE_EVENTS": {
      memoizedSchema(ReplaceEventsInputSchema).parse(action.input);

      walletAccountFeedOperations.replaceEventsOperation(
        state.global,
        action as ReplaceEventsAction,
        dispatch,
      );

      break;
    }

    case "SET_EVENT_IGNORED": {
      memoizedSchema(SetEventIgnoredInputSchema).parse(action.input);

      walletAccountReviewOperations.setEventIgnoredOperation(
        state.global,
        action as SetEventIgnoredAction,
        dispatch,
      );

      break;
    }

    case "SET_EVENT_NOTES": {
      memoizedSchema(SetEventNotesInputSchema).parse(action.input);

      walletAccountReviewOperations.setEventNotesOperation(
        state.global,
        action as SetEventNotesAction,
        dispatch,
      );

      break;
    }

    case "RETYPE_EVENT": {
      memoizedSchema(RetypeEventInputSchema).parse(action.input);

      walletAccountReviewOperations.retypeEventOperation(
        state.global,
        action as RetypeEventAction,
        dispatch,
      );

      break;
    }

    case "PIN_VALUATIONS": {
      memoizedSchema(PinValuationsInputSchema).parse(action.input);

      walletAccountReviewOperations.pinValuationsOperation(
        state.global,
        action as PinValuationsAction,
        dispatch,
      );

      break;
    }

    case "RECORD_SCAN_PROGRESS": {
      memoizedSchema(RecordScanProgressInputSchema).parse(action.input);

      walletAccountCursorOperations.recordScanProgressOperation(
        state.global,
        action as RecordScanProgressAction,
        dispatch,
      );

      break;
    }

    case "SET_BACKFILL_STATE": {
      memoizedSchema(SetBackfillStateInputSchema).parse(action.input);

      walletAccountCursorOperations.setBackfillStateOperation(
        state.global,
        action as SetBackfillStateAction,
        dispatch,
      );

      break;
    }

    case "SET_NATIVE_BALANCE": {
      memoizedSchema(SetNativeBalanceInputSchema).parse(action.input);

      walletAccountCursorOperations.setNativeBalanceOperation(
        state.global,
        action as SetNativeBalanceAction,
        dispatch,
      );

      break;
    }

    case "SET_REDECODE_STATE": {
      memoizedSchema(SetRedecodeStateInputSchema).parse(action.input);

      walletAccountCursorOperations.setRedecodeStateOperation(
        state.global,
        action as SetRedecodeStateAction,
        dispatch,
      );

      break;
    }

    case "SET_TOKEN_BALANCES": {
      memoizedSchema(SetTokenBalancesInputSchema).parse(action.input);

      walletAccountCursorOperations.setTokenBalancesOperation(
        state.global,
        action as SetTokenBalancesAction,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<WalletAccountPHState> =
  createReducer(stateReducer);
