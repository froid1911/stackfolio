/**
 * Validator performance from what the staking read already ingests: daily
 * balances and withdrawals. Since Capella every excess wei above 32 ETH is
 * swept to the withdrawal address, so a healthy validator's balance stays
 * flat — rewards are the balance change PLUS what was withdrawn over the
 * same span. A full exit nets to zero the same way.
 *
 * Day boundaries are coarse: a withdrawal counts toward a span when it
 * falls after the span's anchor day and no later than its last day.
 */
import type { StakingBalance, Withdrawal } from "./graphql.js";

const DAY = 86_400_000;

const gwei = (v: string): number => Number(v) / 1e9;

export interface ValidatorSummary {
  /** Latest observed balance, ETH. */
  now: number;
  /** Rewards over the last 7 / 30 days, ETH; null if the history is shorter. */
  delta7d: number | null;
  delta30d: number | null;
  /** Annualised rewards over the observed window; null below two observations. */
  apr: number | null;
  /** Everything ever withdrawn, ETH. */
  withdrawn: number;
  /** Daily balance rows observed and the days they span. */
  rows: number;
  days: number;
}

export function validatorSummary(
  index: number,
  balances: StakingBalance[],
  withdrawals: Withdrawal[],
): ValidatorSummary {
  const rows = balances
    .filter((b) => b.validatorIndex === index)
    .map((b) => ({ at: new Date(b.day).getTime(), eth: gwei(b.balanceGwei) }))
    .sort((a, b) => a.at - b.at);
  const mine = withdrawals
    .filter((w) => w.validatorIndex === index)
    .map((w) => ({ at: new Date(w.timestamp).getTime(), eth: gwei(w.amountGwei) }));
  const withdrawn = mine.reduce((sum, w) => sum + w.eth, 0);
  const last = rows.at(-1);
  const first = rows[0];
  if (!last || !first) {
    return { now: 0, delta7d: null, delta30d: null, apr: null, withdrawn, rows: 0, days: 0 };
  }

  /** Balance change plus withdrawals between an anchor row and the last day. */
  const earnedSince = (anchor: { at: number; eth: number }): number =>
    last.eth -
    anchor.eth +
    mine
      .filter((w) => w.at > anchor.at && w.at <= last.at + DAY - 1)
      .reduce((sum, w) => sum + w.eth, 0);

  /** The newest row at least `daysAgo` before the last one. */
  const anchorAt = (daysAgo: number) => {
    const target = last.at - daysAgo * DAY;
    let found: (typeof rows)[number] | null = null;
    for (const row of rows) {
      if (row.at <= target) found = row;
      else break;
    }
    return found;
  };

  const days = Math.round((last.at - first.at) / DAY);
  const seven = anchorAt(7);
  const thirty = anchorAt(30);
  return {
    now: last.eth,
    delta7d: seven ? earnedSince(seven) : null,
    delta30d: thirty ? earnedSince(thirty) : null,
    apr: days > 0 && first.eth > 0 ? (earnedSince(first) / first.eth) * (365 / days) : null,
    withdrawn,
    rows: rows.length,
    days,
  };
}
