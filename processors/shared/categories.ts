/**
 * Tax categories (CoinTracking's list) for ledger events. One function for
 * the books, the subgraph and the editor: an override wins, then the most
 * specific counterparty rule, then a default derived from what the scan and
 * the decoder know, else UNCLASSIFIED. Rows are grouped by transaction hash -
 * a decoded leg is "<hash>-<log>", a generic row "<hash>".
 */
export type TxCategory =
  | "TRADE" | "SPEND" | "INCOME" | "STAKING" | "LENDING_INCOME" | "MINING"
  | "AIRDROP" | "AIRDROP_NON_TAXABLE" | "GIFT_IN" | "GIFT_OUT" | "DONATION"
  | "LOST" | "STOLEN" | "DEPOSIT" | "WITHDRAWAL" | "COLLATERAL_OUT"
  | "COLLATERAL_IN" | "BORROWING" | "LOAN_REPAYMENT" | "LIQUIDATION" | "FEE"
  | "MARGIN" | "UNCLASSIFIED";
export type CategorySource = "override" | "rule" | "auto" | "unclassified";

export interface ClassifyEvent {
  wallet: string;
  id: string;
  eventIdentifier: string;
  sequenceIndex: number;
  type: string;
  subtype: string;
  asset: string;
  amount: string;
  counterparty: string | null;
  chainId?: number;
}
export interface CategoryRuleLike {
  id: string;
  counterparty: string;
  chainId: number | null;
  direction: string;
  asset: string | null;
  category: string;
  label: string | null;
}
export interface CategoryOverrideLike {
  category: string;
  giftCost: string | null;
  giftAcquiredAt: string | null;
}
export interface ClassifyContext {
  knownAddresses: ReadonlySet<string>;
  rules: CategoryRuleLike[];
  /** overrideKey(wallet, eventId, sequenceIndex) -> override. */
  overrides: Map<string, CategoryOverrideLike>;
}
export interface Classified {
  category: TxCategory;
  source: CategorySource;
  giftCost: string | null;
  giftAcquiredAt: string | null;
}

/** Which way a row moves value: SPEND leaves, RECEIVE and STAKING arrive. */
export const DIRECTION: Record<string, "in" | "out" | undefined> = {
  RECEIVE: "in",
  STAKING: "in",
  SPEND: "out",
};

/** A beacon withdrawal this large is the stake: below 16 ETH a validator is ejected. */
const EXIT_WEI = 16_000_000_000_000_000_000n;

export const txHashOf = (eventIdentifier: string): string => {
  const match = /^(0x[0-9a-fA-F]{64})-\d+$/.exec(eventIdentifier);
  return (match ? match[1] : eventIdentifier).toLowerCase();
};

export const overrideKey = (wallet: string, eventId: string, sequenceIndex: number): string =>
  `${wallet.toLowerCase()}|${eventId}|${sequenceIndex}`;

const SUBTYPE_DEFAULT: Record<string, TxCategory> = {
  DEPOSIT_ASSET: "COLLATERAL_OUT",
  REMOVE_ASSET: "COLLATERAL_IN",
  BORROW: "BORROWING",
  REPAY: "LOAN_REPAYMENT",
  LIQUIDATION: "LIQUIDATION",
  YIELD: "LENDING_INCOME",
  AIRDROP: "AIRDROP",
  BLOCK_PRODUCTION: "STAKING",
  FEE: "FEE",
  LP_MINT: "COLLATERAL_OUT",
  LP_BURN: "COLLATERAL_IN",
  NAME_REGISTRATION: "FEE",
};

function ruleFor(event: ClassifyEvent, direction: "in" | "out", rules: CategoryRuleLike[]): CategoryRuleLike | undefined {
  const counterparty = event.counterparty?.toLowerCase();
  if (!counterparty) return undefined;
  const matching = rules.filter(
    (r) =>
      r.counterparty === counterparty &&
      (r.chainId === null || r.chainId === event.chainId) &&
      (r.direction === "ANY" || r.direction.toLowerCase() === direction) &&
      (r.asset === null || r.asset === event.asset),
  );
  const specificity = (r: CategoryRuleLike) =>
    (r.chainId !== null ? 1 : 0) + (r.direction !== "ANY" ? 1 : 0) + (r.asset !== null ? 1 : 0);
  // Most specific first; among equals the newest (later in the list).
  return matching
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => specificity(b.rule) - specificity(a.rule) || b.index - a.index)[0]?.rule;
}

function derived(event: ClassifyEvent, direction: "in" | "out", ctx: ClassifyContext, trade: boolean): TxCategory {
  const fromSelf = event.counterparty?.toLowerCase() === event.wallet.toLowerCase();
  if (event.type === "STAKING" && event.subtype === "WITHDRAWAL") {
    if (!fromSelf) return "COLLATERAL_IN"; // principal back out of a staking contract
    return BigInt(event.amount) >= EXIT_WEI ? "COLLATERAL_IN" : "STAKING";
  }
  if (event.subtype === "WITHDRAWAL" && direction === "in") return "COLLATERAL_IN";
  const bySubtype = SUBTYPE_DEFAULT[event.subtype];
  if (bySubtype) return bySubtype;
  if (event.type === "STAKING") return "STAKING";
  if (event.type === "TRADE" || trade) return "TRADE";
  if (event.counterparty && !fromSelf && ctx.knownAddresses.has(event.counterparty.toLowerCase())) {
    return direction === "out" ? "WITHDRAWAL" : "DEPOSIT";
  }
  return "UNCLASSIFIED";
}

export function classify(events: ClassifyEvent[], ctx: ClassifyContext): Map<string, Classified> {
  // Per (transaction, wallet): which assets went out and came in, for trades.
  const flows = new Map<string, { out: Set<string>; in: Set<string> }>();
  for (const event of events) {
    const direction = DIRECTION[event.type];
    if (!direction || event.subtype === "FEE") continue;
    const key = `${txHashOf(event.eventIdentifier)}|${event.wallet.toLowerCase()}`;
    const flow = flows.get(key) ?? { out: new Set<string>(), in: new Set<string>() };
    flow[direction].add(event.asset);
    flows.set(key, flow);
  }
  const result = new Map<string, Classified>();
  for (const event of events) {
    const key = overrideKey(event.wallet, event.id, event.sequenceIndex);
    const override = ctx.overrides.get(key);
    if (override) {
      result.set(key, {
        category: override.category as TxCategory,
        source: "override",
        giftCost: override.giftCost,
        giftAcquiredAt: override.giftAcquiredAt,
      });
      continue;
    }
    const direction = DIRECTION[event.type] ?? "in";
    const rule = ruleFor(event, direction, ctx.rules);
    if (rule) {
      result.set(key, { category: rule.category as TxCategory, source: "rule", giftCost: null, giftAcquiredAt: null });
      continue;
    }
    const flow = flows.get(`${txHashOf(event.eventIdentifier)}|${event.wallet.toLowerCase()}`);
    const trade =
      flow !== undefined &&
      flow.out.size > 0 &&
      flow.in.size > 0 &&
      [...flow.in].some((asset) => !flow.out.has(asset));
    const category = derived(event, direction, ctx, trade);
    result.set(key, {
      category,
      source: category === "UNCLASSIFIED" ? "unclassified" : "auto",
      giftCost: null,
      giftAcquiredAt: null,
    });
  }
  return result;
}
