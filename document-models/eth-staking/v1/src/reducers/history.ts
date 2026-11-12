import type { EthStakingHistoryOperations } from "document-models/eth-staking/v1";
import {
  CursorRegressionError,
  InvalidAmountError,
} from "../../gen/history/error.js";

export const ethStakingHistoryOperations: EthStakingHistoryOperations = {
  recordBalancesOperation(state, action) {
    for (const point of action.input.points) {
      const existing = state.balanceHistory.find(
        (p) => p.validatorIndex === point.validatorIndex && p.day === point.day,
      );
      if (existing) {
        existing.balanceGwei = point.balanceGwei;
      } else {
        state.balanceHistory.push({
          validatorIndex: point.validatorIndex,
          day: point.day,
          balanceGwei: point.balanceGwei,
        });
      }
    }
  },
  recordWithdrawalsOperation(state, action) {
    const isDecimal = (value: string) =>
      /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value);
    for (const withdrawal of action.input.withdrawals) {
      if (!isDecimal(withdrawal.amountGwei)) {
        throw new InvalidAmountError(
          `${withdrawal.amountGwei} is not a decimal amount`,
        );
      }
    }
    const known = new Set(state.withdrawals.map((w) => w.withdrawalRef));
    for (const withdrawal of action.input.withdrawals) {
      if (known.has(withdrawal.withdrawalRef)) continue;
      known.add(withdrawal.withdrawalRef);
      state.withdrawals.push({
        id: withdrawal.id,
        validatorIndex: withdrawal.validatorIndex,
        timestamp: withdrawal.timestamp,
        amountGwei: withdrawal.amountGwei,
        blockNumber: withdrawal.blockNumber,
        withdrawalRef: withdrawal.withdrawalRef,
      });
    }
  },
  recordStakeScanProgressOperation(state, action) {
    const cursor = state.cursor ?? {
      lastBalanceDay: null,
      lastWithdrawalBlock: null,
    };
    if (
      action.input.lastBalanceDay != null &&
      cursor.lastBalanceDay != null &&
      action.input.lastBalanceDay < cursor.lastBalanceDay
    ) {
      throw new CursorRegressionError(
        `lastBalanceDay would regress from ${cursor.lastBalanceDay} to ${action.input.lastBalanceDay}`,
      );
    }
    if (
      action.input.lastWithdrawalBlock != null &&
      cursor.lastWithdrawalBlock != null &&
      action.input.lastWithdrawalBlock < cursor.lastWithdrawalBlock
    ) {
      throw new CursorRegressionError(
        `lastWithdrawalBlock would regress from ${cursor.lastWithdrawalBlock} to ${action.input.lastWithdrawalBlock}`,
      );
    }
    if (action.input.lastBalanceDay != null)
      cursor.lastBalanceDay = action.input.lastBalanceDay;
    if (action.input.lastWithdrawalBlock != null)
      cursor.lastWithdrawalBlock = action.input.lastWithdrawalBlock;
    state.cursor = cursor;
  },
};
