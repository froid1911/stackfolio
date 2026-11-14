/**
 * Tax categories in the editor: plain-English names, the grouped choices a
 * select offers, and the exact inputs the portfolio's category actions take
 * (blanks omitted, so the model's zod schemas always accept them).
 */

export const CATEGORY_LABEL: Record<string, string> = {
  TRADE: "Trade",
  SPEND: "Spend",
  LIQUIDATION: "Liquidation",
  INCOME: "Income",
  STAKING: "Staking",
  LENDING_INCOME: "Lending income",
  MINING: "Mining",
  AIRDROP: "Airdrop (income)",
  AIRDROP_NON_TAXABLE: "Airdrop (non-taxable)",
  DEPOSIT: "Deposit (own)",
  WITHDRAWAL: "Withdrawal (own)",
  COLLATERAL_OUT: "Collateral out",
  COLLATERAL_IN: "Collateral in",
  BORROWING: "Borrowing",
  LOAN_REPAYMENT: "Loan repayment",
  GIFT_IN: "Gift received",
  GIFT_OUT: "Gift sent",
  DONATION: "Donation",
  LOST: "Lost",
  STOLEN: "Stolen",
  FEE: "Fee",
  MARGIN: "Margin / derivatives",
  SPAM: "Spam",
  UNCLASSIFIED: "Unclassified",
};

/** What a person can choose; SPAM and UNCLASSIFIED are never chosen. */
export const CATEGORY_CHOICES: { group: string; options: string[] }[] = [
  { group: "Trades", options: ["TRADE", "SPEND", "LIQUIDATION"] },
  {
    group: "Income",
    options: ["INCOME", "STAKING", "LENDING_INCOME", "MINING", "AIRDROP", "AIRDROP_NON_TAXABLE"],
  },
  { group: "Own moves", options: ["DEPOSIT", "WITHDRAWAL", "COLLATERAL_OUT", "COLLATERAL_IN"] },
  { group: "Loans", options: ["BORROWING", "LOAN_REPAYMENT"] },
  { group: "Gifts & losses", options: ["GIFT_IN", "GIFT_OUT", "DONATION", "LOST", "STOLEN"] },
  { group: "Other", options: ["FEE", "MARGIN"] },
];

export const SOURCE_LABEL: Record<string, string> = {
  override: "your choice",
  rule: "your rule",
  auto: "automatic",
  unclassified: "needs a type",
};

export interface EventKey {
  wallet: string;
  eventId: string;
  sequenceIndex: number;
}

/** "wallet|eventId|sequenceIndex" back into its parts (ids never hold "|"). */
export function parseEventKey(key: string): EventKey {
  const first = key.indexOf("|");
  const last = key.lastIndexOf("|");
  return {
    wallet: key.slice(0, first),
    eventId: key.slice(first + 1, last),
    sequenceIndex: Number(key.slice(last + 1)),
  };
}

/** SET_EVENT_CATEGORIES' input; the giver's cost and date only on GIFT_IN. */
export function overridesInput(
  keys: string[],
  category: string,
  gift: { cost?: string; acquiredAt?: string } = {},
) {
  const cost = gift.cost?.trim();
  const acquiredAt = gift.acquiredAt?.trim();
  const giftFields =
    category === "GIFT_IN"
      ? { ...(cost ? { giftCost: cost } : {}), ...(acquiredAt ? { giftAcquiredAt: acquiredAt } : {}) }
      : {};
  return {
    overrides: keys.map((key) => ({
      ...parseEventKey(key),
      category: category as never,
      ...giftFields,
    })),
  };
}

/** ADD_CATEGORY_RULE's input: address lower-cased, label trimmed or absent. */
export function ruleInput(
  id: string,
  counterparty: string,
  direction: "IN" | "OUT" | "ANY",
  category: string,
  label?: string,
) {
  const trimmed = label?.trim();
  return {
    id,
    counterparty: counterparty.trim().toLowerCase(),
    direction,
    category: category as never,
    ...(trimmed ? { label: trimmed } : {}),
  };
}

/** Rules match an address; protocol ids and blanks can only be overridden. */
export const isAddress = (value: string | null): value is string =>
  value !== null && /^0x[0-9a-fA-F]{40}$/.test(value);
