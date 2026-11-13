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
}

export interface Lot {
  wallet: string;
  asset: string;
  quantity: bigint;
  cost: bigint;
  sourceEventId: string;
  sourceSeq: number;
}

export interface ConsumedLeg {
  sourceEventId: string;
  quantity: string;
  cost: string;
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
}

export function emptyFoldState(): FoldState {
  return {
    lots: new Map(),
    realized: [],
    income: new Map(),
    months: new Map(),
    unpriced: { in: 0, out: 0 },
    unpricedLegs: [],
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

/** Protocol mechanics whose value the holdings view tracks and the
 * accounting fold must not double count (or price without a market). */
const NOISE_SUBTYPES = new Set([
  "DEPOSIT_ASSET",
  "REMOVE_ASSET",
  "LP_MINT",
  "LP_BURN",
  "BORROW",
  "REPAY",
  "LIQUIDATION",
  "NAME_REGISTRATION",
  "BRIDGE",
  "APPROVE",
  "SPAM",
]);

const INCOME_SUBTYPES = new Map<string, string>([
  ["YIELD", "YIELD"],
  ["AIRDROP", "AIRDROP"],
  ["BLOCK_PRODUCTION", "BLOCK_PRODUCTION"],
]);

const SIGNED: Record<string, 1 | -1 | undefined> = {
  RECEIVE: 1,
  STAKING: 1,
  SPEND: -1,
};

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
  });
  state.lots.set(key, lots);
}

/**
 * Fold one eventIdentifier group (all wallets' rows sharing the identifier,
 * in sequence order). Groups carry swaps and transfers: legs of one group
 * are paired against each other before touching the open lots.
 */
interface Carry {
  wallet: string;
  asset: string;
  quantity: bigint;
  cost: bigint;
  event: FoldEvent;
}

/**
 * Fold one eventIdentifier group (all wallets' rows sharing the identifier,
 * in sequence order). Groups carry swaps and transfers: a move out of one
 * wallet pairs with the matching move into another before either side
 * touches the open lots, so the cost basis travels with the tokens.
 */
export function foldGroup(
  state: FoldState,
  group: FoldEvent[],
  ctx: FoldContext,
): FoldState {
  const legs = group.filter((event) => !event.ignored);
  const spends = legs.filter((event) => SIGNED[event.type] === -1);
  const receives = legs.filter((event) => SIGNED[event.type] === 1);
  const carried: Carry[] = [];

  for (const event of spends) {
    if (NOISE_SUBTYPES.has(event.subtype)) continue;
    const agg = monthAgg(state, event.wallet, monthOf(event.timestamp));
    const quantity = BigInt(event.amount);
    const priced = legValue(event, ctx);
    const selfTransfer =
      event.counterparty != null &&
      ctx.knownAddresses.has(event.counterparty.toLowerCase());

    const basis = consumeFcfs(state, event.wallet, event.asset, quantity);
    if (basis.consumed < quantity) {
      gap(state, agg, event, "basis");
    }

    if (event.subtype === "FEE") {
      // A fee leaves at cost and books its value as an expense; the
      // round-trip's PnL stays with the lots, only the fee is spent.
      if (priced) {
        agg.expense += priced.value;
      } else {
        gap(state, agg, event, "value");
      }
      continue;
    }

    if (selfTransfer) {
      // Move: the basis waits for this group's inflow (another wallet of
      // the portfolio) or re-opens on this wallet when nothing pairs it.
      if (basis.consumed > 0n) {
        carried.push({
          wallet: event.wallet,
          asset: event.asset,
          quantity: basis.consumed,
          cost: basis.cost,
          event,
        });
      }
      continue;
    }

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
    if (NOISE_SUBTYPES.has(event.subtype)) continue;
    const agg = monthAgg(state, event.wallet, monthOf(event.timestamp));
    const quantity = BigInt(event.amount);
    const priced = legValue(event, ctx);
    const selfTransfer =
      event.counterparty != null &&
      ctx.knownAddresses.has(event.counterparty.toLowerCase());

    if (selfTransfer) {
      // Pair with a carried-out basis of the same asset, oldest first.
      let remaining = quantity;
      for (const carry of carried) {
        if (remaining === 0n) break;
        if (carry.asset !== event.asset || carry.quantity === 0n) continue;
        const take =
          carry.quantity <= remaining ? carry.quantity : remaining;
        const cost = (carry.cost * take) / carry.quantity;
        carry.quantity -= take;
        carry.cost -= cost;
        remaining -= take;
        openLot(state, event, take, cost);
      }
      if (remaining === quantity) {
        // Nothing carried it: an inflow from a known wallet with no
        // visible outflow opens at market like any other receipt.
        if (!priced) {
          gap(state, agg, event, "value");
          continue;
        }
        openLot(state, event, quantity, priced.value);
      } else if (remaining > 0n) {
        // Partial pairing: the rest is an ordinary market-priced inflow.
        if (priced) {
          openLot(state, event, remaining, priced.value);
        } else {
          gap(state, agg, event, "value");
        }
      }
      continue;
    }

    if (!priced) {
      gap(state, agg, event, "value");
      continue;
    }
    const incomeBucket =
      INCOME_SUBTYPES.get(event.subtype) ??
      (event.type === "STAKING" ? "STAKING" : undefined);
    if (incomeBucket) {
      const key = `${event.wallet}|${incomeBucket}|${monthOf(event.timestamp)}`;
      state.income.set(key, (state.income.get(key) ?? 0n) + priced.value);
      agg.income += priced.value;
    }
    openLot(state, event, quantity, priced.value);
  }

  for (const carry of carried) {
    // A move nobody paired: the tokens never left the wallet's books.
    if (carry.quantity > 0n) {
      openLot(state, carry.event, carry.quantity, carry.cost);
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
    }>,
  ][];
  realized: RealizedRow[];
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
  return state;
}
