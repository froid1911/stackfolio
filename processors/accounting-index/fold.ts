/**
 * FCFS accounting fold over the ledger: cost-basis lots, realized
 * disposals, income buckets and monthly aggregates, computed in ledger
 * order. The fold is a pure function of the ordered ledger plus a context
 * (known wallet addresses, asset decimals); replaying the same events
 * always yields the same state, which is what makes the processor's
 * checkpoint legitimate.
 *
 * Money is scaled 1e8 (PRICE_SCALE); quantities are raw token units (BigInt,
 * exact). A lot carries its total cost, not a rounded unit cost, so FCFS
 * consumption never drifts.
 */

import {
  classify,
  DIRECTION,
  overrideKey,
  type CategoryOverrideLike,
  type CategoryRuleLike,
  type Classified,
} from "../shared/categories.js";

export const PRICE_SCALE = 8;

export interface FoldValuation {
  unit: string;
  price: string;
  source: string;
}

export interface FoldEvent {
  wallet: string;
  id: string;
  eventIdentifier: string;
  sequenceIndex: number;
  timestamp: string;
  type: string;
  subtype: string;
  asset: string;
  amount: string;
  counterparty: string | null;
  ignored: boolean;
  valuation: FoldValuation | null;
}

export interface FoldContext {
  method: "FCFS";
  currency: string;
  /** Lowercase wallet addresses of the portfolio, for self-transfer moves. */
  knownAddresses: Set<string>;
  /** Asset identifier -> token decimals. Unknown assets cannot be priced. */
  decimals: Map<string, number>;
  /** The portfolio's counterparty rules, oldest first. */
  rules: CategoryRuleLike[];
  /** overrideKey(wallet, eventId, sequenceIndex) -> hand-chosen category. */
  overrides: Map<string, CategoryOverrideLike>;
}

export interface Lot {
  wallet: string;
  asset: string;
  quantity: bigint;
  cost: bigint;
  sourceEventId: string;
  sourceSeq: number;
  /** When the units were acquired: the holding period runs from here. */
  acquiredAt: string;
}

export interface ConsumedLeg {
  sourceEventId: string;
  quantity: string;
  cost: string;
  acquiredAt: string;
}

/** Units that left the books with no gain or loss, listed for the report. */
export interface Departure {
  wallet: string;
  asset: string;
  timestamp: string;
  category: "GIFT_OUT" | "DONATION" | "LOST" | "STOLEN" | "LOAN_REPAYMENT";
  quantity: string;
  cost: string;
  eventId: string;
}

export interface RealizedRow {
  id: string;
  wallet: string;
  asset: string;
  timestamp: string;
  quantity: string;
  cost: string;
  proceeds: string;
  pnl: string;
  sourceEventId: string;
  sourceSeq: number;
  consumed: ConsumedLeg[];
}

export interface MonthAgg {
  income: bigint;
  expense: bigint;
  realized: bigint;
  unpricedIn: number;
  unpricedOut: number;
}

/** A leg the books could not value: no cost basis behind a disposal, or no
 * price for the leg itself. The History page lists exactly these. */
export interface UnpricedLeg {
  wallet: string;
  eventId: string;
  sequenceIndex: number;
  asset: string;
  timestamp: string;
  reason: "basis" | "value";
}

export interface FoldState {
  /** wallet|asset -> open lots in acquisition order. */
  lots: Map<string, Lot[]>;
  realized: RealizedRow[];
  /** wallet|bucket|YYYY-MM -> scaled value. */
  income: Map<string, bigint>;
  /** wallet|YYYY-MM -> aggregates. */
  months: Map<string, MonthAgg>;
  unpriced: { in: number; out: number };
  /** One entry per counted gap, in fold order. */
  unpricedLegs: UnpricedLeg[];
  departures: Departure[];
  /** overrideKey(wallet, eventId, sequenceIndex) -> resolved tax category. */
  categories: Map<string, Classified>;
}

export function emptyFoldState(): FoldState {
  return {
    lots: new Map(),
    realized: [],
    income: new Map(),
    months: new Map(),
    unpriced: { in: 0, out: 0 },
    unpricedLegs: [],
    departures: [],
    categories: new Map(),
  };
}

/** Count a gap in the month and the totals, and record the leg behind it. */
function gap(state: FoldState, agg: MonthAgg, event: FoldEvent, reason: UnpricedLeg["reason"]): void {
  if (reason === "basis") {
    agg.unpricedIn += 1;
    state.unpriced.in += 1;
  } else {
    agg.unpricedOut += 1;
    state.unpriced.out += 1;
  }
  state.unpricedLegs.push({
    wallet: event.wallet,
    eventId: event.id,
    sequenceIndex: event.sequenceIndex,
    asset: event.asset,
    timestamp: event.timestamp,
    reason,
  });
}

/** Categories booked as a sale out and a purchase in, at market value. */
const DISPOSALS = new Set(["TRADE", "SPEND", "LIQUIDATION"]);
/** Out: units leave at cost with no gain or loss. */
const DEPARTURES = new Set(["GIFT_OUT", "DONATION", "LOST", "STOLEN", "LOAN_REPAYMENT"]);
/** In: §22 Nr. 3 income at market value, bucketed by category. */
const INCOME = new Set(["INCOME", "STAKING", "LENDING_INCOME", "MINING", "AIRDROP"]);
/** Between own wallets or accounts: the lots travel with their basis. */
const MOVES = new Set(["DEPOSIT", "WITHDRAWAL"]);

const parsePrice = (value: string): bigint | null => {
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const sign = whole.startsWith("-") ? -1n : 1n;
  const digits = whole.replace("-", "");
  const width = digits.length + PRICE_SCALE;
  const scaled = (digits + fraction).padEnd(width, "0").slice(0, width);
  return sign * BigInt(scaled);
};

export function monthOf(timestamp: string): string {
  return timestamp.slice(0, 7);
}

function monthAgg(state: FoldState, wallet: string, month: string): MonthAgg {
  const key = `${wallet}|${month}`;
  let agg = state.months.get(key);
  if (!agg) {
    agg = { income: 0n, expense: 0n, realized: 0n, unpricedIn: 0, unpricedOut: 0 };
    state.months.set(key, agg);
  }
  return agg;
}

/** Scaled market value of a raw quantity at a valuation, or null when the
 * event (or its asset) cannot be priced. */
function legValue(
  event: FoldEvent,
  ctx: FoldContext,
): { value: bigint; priceScaled: bigint } | null {
  const valuation = event.valuation;
  if (!valuation || valuation.source === "UNPRICED") return null;
  if (valuation.unit !== ctx.currency) return null;
  const priceScaled = parsePrice(valuation.price);
  if (priceScaled === null) return null;
  const decimals = ctx.decimals.get(event.asset);
  if (decimals == null) return null;
  const quantity = BigInt(event.amount);
  return {
    value: (quantity * priceScaled) / 10n ** BigInt(decimals),
    priceScaled,
  };
}

/** Consume up to `quantity` raw units FCFS; returns the consumed quantity
 * and the cost basis released. */
function consumeFcfs(
  state: FoldState,
  wallet: string,
  asset: string,
  quantity: bigint,
): { consumed: bigint; cost: bigint; legs: ConsumedLeg[] } {
  const key = `${wallet}|${asset}`;
  const lots = state.lots.get(key) ?? [];
  let remaining = quantity;
  let cost = 0n;
  const legs: ConsumedLeg[] = [];
  const kept: Lot[] = [];
  for (const lot of lots) {
    if (remaining === 0n) {
      kept.push(lot);
      continue;
    }
    const take = lot.quantity <= remaining ? lot.quantity : remaining;
    const takeCost = (lot.cost * take) / lot.quantity;
    remaining -= take;
    cost += takeCost;
    legs.push({
      sourceEventId: lot.sourceEventId,
      quantity: take.toString(),
      cost: takeCost.toString(),
      acquiredAt: lot.acquiredAt,
    });
    if (lot.quantity > take) {
      kept.push({
        ...lot,
        quantity: lot.quantity - take,
        cost: lot.cost - takeCost,
      });
    }
  }
  if (kept.length === 0) state.lots.delete(key);
  else state.lots.set(key, kept);
  return { consumed: quantity - remaining, cost, legs };
}

function openLot(
  state: FoldState,
  event: FoldEvent,
  quantity: bigint,
  cost: bigint,
  acquiredAt: string = event.timestamp,
): void {
  const key = `${event.wallet}|${event.asset}`;
  const lots = state.lots.get(key) ?? [];
  lots.push({
    wallet: event.wallet,
    asset: event.asset,
    quantity,
    cost,
    sourceEventId: event.id,
    sourceSeq: event.sequenceIndex,
    acquiredAt,
  });
  state.lots.set(key, lots);
}

/** Basis a move carried out of a wallet, lot by lot so each part keeps its
 * acquisition date, waiting for the group's inflow on another wallet. */
interface Carry {
  asset: string;
  parts: Array<{ quantity: bigint; cost: bigint; acquiredAt: string }>;
  event: FoldEvent;
}

/**
 * Fold one eventIdentifier group (all wallets' rows sharing the identifier,
 * in sequence order) by each leg's tax category. A move out of one wallet
 * pairs with the matching move into another before either side touches the
 * open lots, so the cost basis and the holding period travel with the
 * tokens. Unclassified legs are not booked: they wait in the review queue.
 */
export function foldGroup(
  state: FoldState,
  group: FoldEvent[],
  ctx: FoldContext,
): FoldState {
  const legs = group.filter((event) => !event.ignored);
  const spends = legs.filter((event) => DIRECTION[event.type] === "out");
  const receives = legs.filter((event) => DIRECTION[event.type] === "in");
  const categoryOf = (event: FoldEvent) =>
    state.categories.get(
      overrideKey(event.wallet, event.id, event.sequenceIndex),
    );
  const carried: Carry[] = [];

  for (const event of spends) {
    const kind = categoryOf(event)?.category ?? "UNCLASSIFIED";
    const fee = kind === "FEE";
    if (!fee && !MOVES.has(kind) && !DISPOSALS.has(kind) && !DEPARTURES.has(kind)) {
      // Collateral, margin and unclassified legs are not booked.
      continue;
    }
    const agg = monthAgg(state, event.wallet, monthOf(event.timestamp));
    const quantity = BigInt(event.amount);
    const basis = consumeFcfs(state, event.wallet, event.asset, quantity);
    if (basis.consumed < quantity) {
      gap(state, agg, event, "basis");
    }

    if (fee) {
      // A fee leaves at cost and books its value as an expense; the
      // round-trip's PnL stays with the lots, only the fee is spent.
      const priced = legValue(event, ctx);
      if (priced) {
        agg.expense += priced.value;
      } else {
        gap(state, agg, event, "value");
      }
      continue;
    }

    if (MOVES.has(kind)) {
      // The basis waits for this group's inflow (another wallet of the
      // portfolio) or re-opens on this wallet when nothing pairs it.
      if (basis.consumed > 0n) {
        carried.push({
          asset: event.asset,
          parts: basis.legs.map((leg) => ({
            quantity: BigInt(leg.quantity),
            cost: BigInt(leg.cost),
            acquiredAt: leg.acquiredAt,
          })),
          event,
        });
      }
      continue;
    }

    if (DEPARTURES.has(kind)) {
      // A gift, a donation, a loss or a loan repayment: no sale, so no
      // gain or loss; the report lists it apart.
      state.departures.push({
        wallet: event.wallet,
        asset: event.asset,
        timestamp: event.timestamp,
        category: kind as Departure["category"],
        quantity: basis.consumed.toString(),
        cost: basis.cost.toString(),
        eventId: event.id,
      });
      continue;
    }

    const priced = legValue(event, ctx);
    if (!priced) {
      // Quantity leaves at cost; the disposal value is unknown and is
      // counted, never guessed as zero.
      gap(state, agg, event, "value");
      continue;
    }
    const proceeds = (priced.value * basis.consumed) / quantity;
    const pnl = proceeds - basis.cost;
    agg.realized += pnl;
    if (basis.consumed > 0n) {
      state.realized.push({
        // A sequence suffix keeps ids unique even when two documents
        // replay identical ledgers; the fold is deterministic, so the
        // numbers are stable across re-folds.
        id: `${event.eventIdentifier}:${event.asset}:${event.id}:${state.realized.length}`,
        wallet: event.wallet,
        asset: event.asset,
        timestamp: event.timestamp,
        quantity: basis.consumed.toString(),
        cost: basis.cost.toString(),
        proceeds: proceeds.toString(),
        pnl: pnl.toString(),
        sourceEventId: event.id,
        sourceSeq: event.sequenceIndex,
        consumed: basis.legs,
      });
    }
  }

  for (const event of receives) {
    const classified = categoryOf(event);
    const kind = classified?.category ?? "UNCLASSIFIED";
    const quantity = BigInt(event.amount);

    if (kind === "AIRDROP_NON_TAXABLE") {
      openLot(state, event, quantity, 0n);
      continue;
    }
    if (kind === "GIFT_IN") {
      // The gift takes over the giver's cost and date (§23 Abs. 1 S. 3);
      // without them the lot opens at 0 and the gap is counted.
      const cost =
        classified?.giftCost != null ? parsePrice(classified.giftCost) : null;
      if (cost === null) {
        gap(state, monthAgg(state, event.wallet, monthOf(event.timestamp)), event, "basis");
      }
      openLot(state, event, quantity, cost ?? 0n, classified?.giftAcquiredAt ?? event.timestamp);
      continue;
    }

    const move = MOVES.has(kind);
    if (!move && !DISPOSALS.has(kind) && !INCOME.has(kind) && kind !== "BORROWING") {
      // Collateral coming back, margin and unclassified legs: not booked.
      continue;
    }
    const agg = monthAgg(state, event.wallet, monthOf(event.timestamp));
    let remaining = quantity;
    if (move) {
      // Pair with a carried-out basis of the same asset, oldest first.
      for (const carry of carried) {
        if (carry.asset !== event.asset) continue;
        for (const part of carry.parts) {
          if (remaining === 0n) break;
          if (part.quantity === 0n) continue;
          const take = part.quantity <= remaining ? part.quantity : remaining;
          const cost = (part.cost * take) / part.quantity;
          part.quantity -= take;
          part.cost -= cost;
          remaining -= take;
          openLot(state, event, take, cost, part.acquiredAt);
        }
      }
      // Nothing (or not all of it) was carried: an inflow from an own
      // wallet or account with no visible outflow opens at market.
      if (remaining === 0n) continue;
    }

    const priced = legValue(event, ctx);
    if (!priced) {
      gap(state, agg, event, "value");
      continue;
    }
    const value = (priced.value * remaining) / quantity;
    if (INCOME.has(kind)) {
      const key = `${event.wallet}|${kind}|${monthOf(event.timestamp)}`;
      state.income.set(key, (state.income.get(key) ?? 0n) + value);
      agg.income += value;
    }
    // Purchases, income and borrowed units all open at market value.
    openLot(state, event, remaining, value);
  }

  for (const carry of carried) {
    // A move nobody paired: the tokens never left the wallet's books.
    for (const part of carry.parts) {
      if (part.quantity > 0n) {
        openLot(state, carry.event, part.quantity, part.cost, part.acquiredAt);
      }
    }
  }
  return state;
}

/** Sort (timestamp, eventIdentifier, sequenceIndex) and group by
 * eventIdentifier. */
export function groupEvents(events: FoldEvent[]): FoldEvent[][] {
  const sorted = [...events].sort(
    (a, b) =>
      a.timestamp.localeCompare(b.timestamp) ||
      a.eventIdentifier.localeCompare(b.eventIdentifier) ||
      a.sequenceIndex - b.sequenceIndex,
  );
  const groups: FoldEvent[][] = [];
  let current: FoldEvent[] = [];
  for (const event of sorted) {
    if (current.length > 0 && current[0].eventIdentifier === event.eventIdentifier) {
      current.push(event);
      continue;
    }
    if (current.length > 0) groups.push(current);
    current = [event];
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export function foldAll(events: FoldEvent[], ctx: FoldContext): FoldState {
  const state = emptyFoldState();
  state.categories = classify(
    events
      .filter((event) => !event.ignored)
      .map((event) => ({
        ...event,
        chainId: Number(/^eip155:(\d+)\//.exec(event.asset)?.[1] ?? 1),
      })),
    {
      knownAddresses: ctx.knownAddresses,
      rules: ctx.rules,
      overrides: ctx.overrides,
    },
  );
  for (const group of groupEvents(events)) foldGroup(state, group, ctx);
  return state;
}

/** JSON-safe form for the checkpoint row. */
export function serializeFold(state: FoldState): string {
  return JSON.stringify({
    lots: [...state.lots.entries()].map(([key, lots]) => [
      key,
      lots.map((lot) => ({
        ...lot,
        quantity: lot.quantity.toString(),
        cost: lot.cost.toString(),
      })),
    ]),
    realized: state.realized,
    departures: state.departures,
    categories: [...state.categories.entries()],
    income: [...state.income.entries()].map(
      ([key, value]) => [key, value.toString()] as [string, string],
    ),
    months: [...state.months.entries()].map(([key, agg]) => [
      key,
      {
        income: agg.income.toString(),
        expense: agg.expense.toString(),
        realized: agg.realized.toString(),
        unpricedIn: agg.unpricedIn,
        unpricedOut: agg.unpricedOut,
      },
    ]),
    unpriced: state.unpriced,
    unpricedLegs: state.unpricedLegs,
  });
}

interface SerializedFold {
  lots: [
    string,
    Array<{
      wallet: string;
      asset: string;
      quantity: string;
      cost: string;
      sourceEventId: string;
      sourceSeq: number;
      /** Absent in checkpoints written before holding periods. */
      acquiredAt?: string;
    }>,
  ][];
  realized: RealizedRow[];
  /** Absent in checkpoints written before tax categories. */
  departures?: Departure[];
  categories?: [string, Classified][];
  income: [string, string][];
  months: [
    string,
    {
      income: string;
      expense: string;
      realized: string;
      unpricedIn: number;
      unpricedOut: number;
    },
  ][];
  unpriced: { in: number; out: number };
  /** Absent in checkpoints written before the list existed. */
  unpricedLegs?: UnpricedLeg[];
}

export function deserializeFold(json: string): FoldState {
  const parsed = JSON.parse(json) as SerializedFold;
  const state = emptyFoldState();
  for (const [key, lots] of parsed.lots) {
    state.lots.set(
      key,
      lots.map((lot) => ({
        wallet: lot.wallet,
        asset: lot.asset,
        quantity: BigInt(lot.quantity),
        cost: BigInt(lot.cost),
        sourceEventId: lot.sourceEventId,
        sourceSeq: lot.sourceSeq,
        acquiredAt: lot.acquiredAt ?? "",
      })),
    );
  }
  state.realized = parsed.realized;
  for (const [key, value] of parsed.income) {
    state.income.set(key, BigInt(value));
  }
  for (const [key, agg] of parsed.months) {
    state.months.set(key, {
      income: BigInt(agg.income),
      expense: BigInt(agg.expense),
      realized: BigInt(agg.realized),
      unpricedIn: agg.unpricedIn,
      unpricedOut: agg.unpricedOut,
    });
  }
  state.unpriced = parsed.unpriced;
  state.unpricedLegs = parsed.unpricedLegs ?? [];
  state.departures = parsed.departures ?? [];
  state.categories = new Map(parsed.categories ?? []);
  return state;
}
