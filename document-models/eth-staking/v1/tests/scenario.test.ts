import { actions, reducer, utils } from "document-models/eth-staking/v1";
import { describe, expect, it } from "vitest";

const {
  upsertValidators,
  recordBalances,
  recordWithdrawals,
  recordStakeScanProgress,
} = actions;

/** A beacon-node sync over one staking document. */
describe("eth-staking scenario", () => {
  it("tracks validators, balances, withdrawals and cursors", () => {
    let document = reducer(
      utils.createDocument(),
      upsertValidators({
        validators: [
          {
            index: 100,
            publicKey: "0x8991",
            withdrawalAddress: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
            activationTimestamp: 1600000000,
            withdrawableTimestamp: null,
            exitedTimestamp: null,
          },
          {
            index: 101,
            publicKey: "0x9000",
            withdrawalAddress: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
            activationTimestamp: 1600000100,
            withdrawableTimestamp: null,
            exitedTimestamp: null,
          },
        ],
      }),
    );

    document = reducer(
      document,
      recordBalances({
        points: [
          { validatorIndex: 100, day: "2026-11-09", balanceGwei: "32000000000" },
          { validatorIndex: 101, day: "2026-11-09", balanceGwei: "32000000000" },
        ],
        ranAt: "2026-11-10T00:00:00.000Z",
      }),
    );
    // Overnight rewards re-record the same day, never add a second point.
    document = reducer(
      document,
      recordBalances({
        points: [
          { validatorIndex: 100, day: "2026-11-09", balanceGwei: "32000123456" },
        ],
        ranAt: "2026-11-10T06:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      recordBalances({
        points: [
          { validatorIndex: 100, day: "2026-11-10", balanceGwei: "32000999999" },
        ],
        ranAt: "2026-11-11T00:00:00.000Z",
      }),
    );

    // The withdrawal scan runs twice; the second finds nothing new.
    document = reducer(
      document,
      recordWithdrawals({
        withdrawals: [
          {
            id: "wd-1",
            validatorIndex: 100,
            timestamp: "2026-11-10T12:00:00.000Z",
            amountGwei: "123456",
            blockNumber: 21000500,
            withdrawalRef: 5000001,
          },
        ],
      }),
    );
    document = reducer(
      document,
      recordWithdrawals({
        withdrawals: [
          {
            id: "wd-1-retry",
            validatorIndex: 100,
            timestamp: "2026-11-10T12:00:00.000Z",
            amountGwei: "123456",
            blockNumber: 21000500,
            withdrawalRef: 5000001,
          },
        ],
      }),
    );

    document = reducer(
      document,
      recordStakeScanProgress({
        lastBalanceDay: "2026-11-10T00:00:00.000Z",
        lastWithdrawalBlock: 21000500,
      }),
    );

    expect(document.operations.global).toHaveLength(7);
    const state = document.state.global;
    expect(state.validators).toHaveLength(2);
    expect(state.balanceHistory).toHaveLength(3);
    expect(state.balanceHistory[0].balanceGwei).toBe("32000123456");
    expect(state.withdrawals).toHaveLength(1);
    expect(state.withdrawals[0].id).toBe("wd-1");
    expect(state.cursor).toEqual({
      lastBalanceDay: "2026-11-10T00:00:00.000Z",
      lastWithdrawalBlock: 21000500,
    });
  });
});
