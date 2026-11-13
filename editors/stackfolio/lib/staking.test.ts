import { describe, expect, it } from "vitest";
import type { StakingBalance, Withdrawal } from "./graphql.js";
import { stakingProfit, validatorSummary } from "./staking.js";

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

describe("stakingProfit", () => {
  const now = Date.parse("2026-11-13T12:00:00Z");
  const sec = (iso: string) => Date.parse(iso) / 1000;
  const v = (validatorIndex: number, over: Partial<{ activationTs: number | null; exitedTs: number | null; withdrawableTs: number | null }> = {}) => ({
    validatorIndex,
    activationTs: sec("2020-12-08T00:00:00Z"),
    exitedTs: null,
    withdrawableTs: null,
    ...over,
  });

  it("splits profit by source and never shows an unimported source as zero", () => {
    const profit = stakingProfit(
      [v(26871), v(52483)],
      new Map([[26871, 32.0035], [52483, 32.0034]]),
      [],
      now,
    );
    expect(profit.outstanding).toBeCloseTo(0.0069);
    expect(profit.skimmed).toBeNull();
    expect(profit.blocks).toBeNull();
    expect(profit.exits).toBe(0);
    expect(profit.validators.map((x) => x.status)).toEqual(["ACTIVE", "ACTIVE"]);
  });

  it("sums imported withdrawals and reads statuses from the timestamps", () => {
    const profit = stakingProfit(
      [
        v(1),
        v(2, { exitedTs: sec("2026-12-01T00:00:00Z") }),
        v(3, { exitedTs: sec("2026-01-01T00:00:00Z") }),
        v(4, { activationTs: sec("2027-01-01T00:00:00Z") }),
      ],
      new Map([[1, 32.01], [2, 32], [3, 0], [4, 32]]),
      [wd("2026-10-10T00:00:00Z", 0.04, 1), wd("2026-01-02T00:00:00Z", 32, 3)],
      now,
    );
    expect(profit.validators.map((x) => x.status)).toEqual(["ACTIVE", "EXITING", "EXITED", "PENDING"]);
    expect(profit.skimmed).toBeCloseTo(0.04);
    expect(profit.exits).toBe(1);
    // An exit's principal is not profit; outstanding counts only what sits above 32.
    expect(profit.outstanding).toBeCloseTo(0.01);
  });
});
