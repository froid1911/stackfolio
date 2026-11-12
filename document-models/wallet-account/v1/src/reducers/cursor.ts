import type { WalletAccountCursorOperations } from "document-models/wallet-account/v1";
import {
  BalanceStaleError,
  CursorRegressionError,
} from "../../gen/cursor/error.js";

export const walletAccountCursorOperations: WalletAccountCursorOperations = {
  recordScanProgressOperation(state, action) {
    const cursor = state.cursor ?? {
      lastLogsBlock: null,
      lastNativeScanBlock: null,
      lastEventTimestamp: null,
      lastRunAt: null,
    };
    if (
      action.input.lastLogsBlock != null &&
      cursor.lastLogsBlock != null &&
      action.input.lastLogsBlock < cursor.lastLogsBlock
    ) {
      throw new CursorRegressionError(
        `lastLogsBlock would regress from ${cursor.lastLogsBlock} to ${action.input.lastLogsBlock}`,
      );
    }
    if (
      action.input.lastNativeScanBlock != null &&
      cursor.lastNativeScanBlock != null &&
      action.input.lastNativeScanBlock < cursor.lastNativeScanBlock
    ) {
      throw new CursorRegressionError(
        `lastNativeScanBlock would regress from ${cursor.lastNativeScanBlock} to ${action.input.lastNativeScanBlock}`,
      );
    }
    if (action.input.lastLogsBlock != null)
      cursor.lastLogsBlock = action.input.lastLogsBlock;
    if (action.input.lastNativeScanBlock != null)
      cursor.lastNativeScanBlock = action.input.lastNativeScanBlock;
    if (action.input.lastEventTimestamp != null)
      cursor.lastEventTimestamp = action.input.lastEventTimestamp;
    cursor.lastRunAt = action.input.ranAt;
    state.cursor = cursor;
  },
  setBackfillStateOperation(state, action) {
    state.backfill = {
      state: action.input.state,
      startBlock: action.input.startBlock ?? null,
      nextBlock: action.input.nextBlock ?? null,
    };
  },
  setNativeBalanceOperation(state, action) {
    if (
      state.nativeBalance &&
      action.input.observedAt <= state.nativeBalance.observedAt
    ) {
      throw new BalanceStaleError(
        `A balance observed at ${action.input.observedAt} is not newer than ${state.nativeBalance.observedAt}`,
      );
    }
    state.nativeBalance = {
      amount: action.input.amount,
      blockNumber: action.input.blockNumber,
      observedAt: action.input.observedAt,
    };
  },
};
