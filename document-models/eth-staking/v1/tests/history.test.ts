import { actions, reducer, utils } from "document-models/eth-staking/v1";
import { describe, expect, it } from "vitest";

const { recordBalances, recordWithdrawals, recordStakeScanProgress } = actions;

const withdrawal = (overrides: Record<string, unknown> = {}) => ({
  id: "wd-1",
  validatorIndex: 100,
  timestamp: "2026-11-10T00:00:00.000Z",
  amountGwei: "32000000000",
  blockNumber: 21000000,
  withdrawalRef: 5000001,
  ...overrides,
});

describe("HistoryOperations", () => {
  it("should handle recordBalances operation", () => {
    const document = reducer(
      utils.createDocument(),
      recordBalances({
        points: [
          { validatorIndex: 100, day: "2026-11-09", balanceGwei: "31000000000" },
          { validatorIndex: 100, day: "2026-11-10", balanceGwei: "31001000000" },
        ],
        ranAt: "2026-11-11T00:00:00.000Z",
      }),
    );

    expect(document.state.global.balanceHistory).toHaveLength(2);
  });

  it("should replace a same-day point and keep older days", () => {
    let document = reducer(
      utils.createDocument(),
      recordBalances({
        points: [
          { validatorIndex: 100, day: "2026-11-09", balanceGwei: "31000000000" },
        ],
        ranAt: "2026-11-10T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      recordBalances({
        points: [
          { validatorIndex: 100, day: "2026-11-09", balanceGwei: "31500000000" },
        ],
        ranAt: "2026-11-10T01:00:00.000Z",
      }),
    );

    expect(document.state.global.balanceHistory).toEqual([
      { validatorIndex: 100, day: "2026-11-09", balanceGwei: "31500000000" },
    ]);
  });

  it("should handle recordWithdrawals operation", () => {
    const document = reducer(
      utils.createDocument(),
      recordWithdrawals({ withdrawals: [withdrawal()] }),
    );

    expect(document.state.global.withdrawals).toHaveLength(1);
    expect(document.state.global.withdrawals[0].withdrawalRef).toBe(5000001);
  });

  it("should silently dedupe withdrawals by reference", () => {
    let document = reducer(
      utils.createDocument(),
      recordWithdrawals({ withdrawals: [withdrawal()] }),
    );
    document = reducer(
      document,
      recordWithdrawals({
        withdrawals: [
          withdrawal({ id: "wd-retry" }),
          withdrawal({ id: "wd-new", withdrawalRef: 5000002 }),
        ],
      }),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.withdrawals).toHaveLength(2);
    expect(document.state.global.withdrawals.map((w) => w.id)).toEqual([
      "wd-1",
      "wd-new",
    ]);
  });

  it("should reject a non-decimal withdrawal amount", () => {
    const document = reducer(
      utils.createDocument(),
      recordWithdrawals({ withdrawals: [withdrawal({ amountGwei: "32.5.1" })] }),
    );

    expect(document.operations.global[0].error).toBe(
      "32.5.1 is not a decimal amount",
    );
    expect(document.state.global.withdrawals).toHaveLength(0);
  });

  it("should handle recordStakeScanProgress operation", () => {
    let document = reducer(
      utils.createDocument(),
      recordStakeScanProgress({
        lastBalanceDay: "2026-11-09T00:00:00.000Z",
        lastWithdrawalBlock: 21000000,
      }),
    );
    expect(document.state.global.cursor).toEqual({
      lastBalanceDay: "2026-11-09T00:00:00.000Z",
      lastWithdrawalBlock: 21000000,
    });

    document = reducer(
      document,
      recordStakeScanProgress({ lastWithdrawalBlock: 21000100 }),
    );
    expect(document.state.global.cursor?.lastBalanceDay).toBe(
      "2026-11-09T00:00:00.000Z",
    );
    expect(document.state.global.cursor?.lastWithdrawalBlock).toBe(21000100);
  });

  it("should reject regressing stake cursors", () => {
    let document = reducer(
      utils.createDocument(),
      recordStakeScanProgress({
        lastBalanceDay: "2026-11-09T00:00:00.000Z",
        lastWithdrawalBlock: 21000000,
      }),
    );
    document = reducer(
      document,
      recordStakeScanProgress({ lastBalanceDay: "2026-11-08T00:00:00.000Z" }),
    );
    expect(document.operations.global[1].error).toBe(
      "lastBalanceDay would regress from 2026-11-09T00:00:00.000Z to 2026-11-08T00:00:00.000Z",
    );

    document = reducer(document, recordStakeScanProgress({ lastWithdrawalBlock: 1 }));
    expect(document.operations.global[2].error).toBe(
      "lastWithdrawalBlock would regress from 21000000 to 1",
    );
  });

  it("should fill cursor fields one at a time on a fresh cursor", () => {
    let document = reducer(
      utils.createDocument(),
      recordStakeScanProgress({ lastWithdrawalBlock: 21000000 }),
    );
    expect(document.state.global.cursor).toEqual({
      lastBalanceDay: null,
      lastWithdrawalBlock: 21000000,
    });

    document = reducer(
      document,
      recordStakeScanProgress({ lastBalanceDay: "2026-11-09T00:00:00.000Z" }),
    );
    expect(document.state.global.cursor?.lastBalanceDay).toBe(
      "2026-11-09T00:00:00.000Z",
    );
  });
});
