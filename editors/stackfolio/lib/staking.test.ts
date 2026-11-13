import { describe, expect, it } from "vitest";
import type { StakingBalance, Withdrawal } from "./graphql.js";
import { validatorSummary } from "./staking.js";

const ETH = 1_000_000_000; // gwei

const bal = (day: string, eth: number): StakingBalance => ({
  documentId: "d",
  validatorIndex: 7,
  day,
  balanceGwei: String(Math.round(eth * ETH)),
});

const wd = (timestamp: string, eth: number, validatorIndex = 7): Withdrawal => ({
  documentId: "d",
  withdrawalRef: 0,
  validatorIndex,
  amountGwei: String(Math.round(eth * ETH)),
  blockNumber: 1,
  timestamp,
});

describe("validatorSummary", () => {
  it("is empty without balances", () => {
    const s = validatorSummary(7, [], []);
    expect(s).toMatchObject({ now: 0, rows: 0, apr: null, delta7d: null, withdrawn: 0 });
  });

  it("refuses an APR from a single observation", () => {
    const s = validatorSummary(7, [bal("2026-11-01", 32.01)], []);
    expect(s.now).toBeCloseTo(32.01);
    expect(s.apr).toBeNull();
  });

  it("counts skimmed withdrawals as rewards: a swept validator is not at 0% APR", () => {
    // Balance oscillates around 32 because the excess is swept every few days.
    const balances = [bal("2026-10-01", 32.0), bal("2026-10-31", 32.0)];
    const withdrawals = [wd("2026-10-10T00:00:00Z", 0.04), wd("2026-10-20T00:00:00Z", 0.04)];
    const s = validatorSummary(7, balances, withdrawals);
    // 0.08 ETH over 30 days on 32 ETH ≈ 3.04% a year
    expect(s.apr).toBeCloseTo((0.08 / 32) * (365 / 30), 6);
    expect(s.withdrawn).toBeCloseTo(0.08);
  });

  it("ignores withdrawals outside the window and of other validators", () => {
    const balances = [bal("2026-10-01", 32.0), bal("2026-10-31", 32.01)];
    const withdrawals = [
      wd("2026-09-15T00:00:00Z", 1), // before the window
      wd("2026-10-15T00:00:00Z", 5, 8), // another validator
    ];
    const s = validatorSummary(7, balances, withdrawals);
    expect(s.apr).toBeCloseTo((0.01 / 32) * (365 / 30), 6);
    expect(s.withdrawn).toBeCloseTo(1); // lifetime total still counts it
  });

  it("reports 7d and 30d rewards including withdrawals in that span", () => {
    const balances = [
      bal("2026-09-30", 32.0),
      bal("2026-10-24", 32.0),
      bal("2026-10-31", 32.002),
    ];
    const withdrawals = [wd("2026-10-27T00:00:00Z", 0.005)];
    const s = validatorSummary(7, balances, withdrawals);
    expect(s.delta7d).toBeCloseTo(0.007);
    expect(s.delta30d).toBeCloseTo(0.007);
  });

  it("leaves a span unanswered when the history is shorter than it", () => {
    const s = validatorSummary(7, [bal("2026-10-28", 32), bal("2026-10-31", 32.001)], []);
    expect(s.delta7d).toBeNull();
    expect(s.delta30d).toBeNull();
    expect(s.days).toBe(3);
  });

  it("nets a full exit to zero rewards rather than a 32 ETH loss", () => {
    const balances = [bal("2026-10-01", 32.0), bal("2026-10-31", 0)];
    const withdrawals = [wd("2026-10-30T00:00:00Z", 32.0)];
    const s = validatorSummary(7, balances, withdrawals);
    expect(s.apr).toBeCloseTo(0, 6);
  });
});
