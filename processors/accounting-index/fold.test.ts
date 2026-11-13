import { describe, expect, it } from "vitest";
import {
  type FoldEvent,
  type FoldContext,
  foldAll,
  groupEvents,
  serializeFold,
  deserializeFold,
} from "./fold.js";

const W1 = "0x1111111111111111111111111111111111111111";
const W2 = "0x2222222222222222222222222222222222222222";
const ETH = "eip155:1/slip44:60";
const USDC = "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const ctx: FoldContext = {
  method: "FCFS",
  currency: "EUR",
  knownAddresses: new Set([W1, W2]),
  decimals: new Map([
    [ETH, 18],
    [USDC, 6],
  ]),
};

const event = (overrides: Partial<FoldEvent> & { id: string }): FoldEvent => ({
  wallet: W1,
  eventIdentifier: `tx-${overrides.id}`,
  sequenceIndex: 0,
  timestamp: "2026-01-15T10:00:00.000Z",
  type: "RECEIVE",
  subtype: "NONE",
  asset: ETH,
  amount: "1000000000000000000",
  counterparty: null,
  ignored: false,
  valuation: { unit: "EUR", price: "2000", source: "COINGECKO" },
  ...overrides,
});

const lotsTotal = (
  state: ReturnType<typeof foldAll>,
  wallet: string,
  asset: string,
): bigint =>
  (state.lots.get(`${wallet}|${asset}`) ?? []).reduce(
    (total, lot) => total + lot.quantity,
    0n,
  );

const month = (state: ReturnType<typeof foldAll>, wallet: string, key: string) =>
  state.months.get(`${wallet}|2026-01`)?.[key as "income" | "expense" | "realized"];

describe("accounting fold", () => {
  it("round-trips a swap to zero realized and the fee as expense", () => {
    const state = foldAll(
      [
        event({ id: "e1", amount: "2000000000000000000" }),
        event({
          id: "e2",
          eventIdentifier: "tx-swap",
          type: "SPEND",
          amount: "1000000000000000000",
          counterparty: "uniswap-v2",
        }),
        event({
          id: "e3",
          eventIdentifier: "tx-swap",
          sequenceIndex: 1,
          asset: USDC,
          amount: "2000000000",
          counterparty: "uniswap-v2",
          valuation: { unit: "EUR", price: "1", source: "COINGECKO" },
        }),
        event({
          id: "e4",
          eventIdentifier: "tx-swap",
          sequenceIndex: 2,
          type: "SPEND",
          subtype: "FEE",
          amount: "10000000000000000",
          counterparty: "uniswap-v2",
        }),
      ],
      ctx,
    );

    // The swap leg disposes; the fee is an expense, not a disposal.
    expect(state.realized).toHaveLength(1);
    expect(state.realized[0].pnl).toBe("0");
    expect(month(state, W1, "realized")).toBe(0n);
    expect(month(state, W1, "expense")).toBe(2000000000n); // 0.01 ETH * 2000
    // 2 bought, -1 swapped, +0.01 fee burned => 0.99 ETH of basis left.
    expect(lotsTotal(state, W1, ETH)).toBe(990000000000000000n);
    expect(lotsTotal(state, W1, USDC)).toBe(2000000000n);
  });

  it("moves self-transfers at original cost with no realized row", () => {
    const state = foldAll(
      [
        event({ id: "e1", amount: "2000000000000000000" }),
        event({
          id: "e2",
          eventIdentifier: "tx-move",
          type: "SPEND",
          amount: "1000000000000000000",
          counterparty: W2,
        }),
        event({
          id: "e3",
          eventIdentifier: "tx-move",
          wallet: W2,
          sequenceIndex: 1,
          amount: "1000000000000000000",
          counterparty: W1,
          valuation: null, // moved basis, not a market event
        }),
      ],
      ctx,
    );

    expect(state.realized).toHaveLength(0);
    expect(lotsTotal(state, W1, ETH)).toBe(1000000000000000000n);
    expect(lotsTotal(state, W2, ETH)).toBe(1000000000000000000n);
    const moved = state.lots.get(`${W2}|${ETH}`)?.[0];
    expect(moved?.cost.toString()).toBe("200000000000"); // 1 ETH * 2000 EUR
  });

  it("re-opens an unpaired move on the sending wallet", () => {
    const state = foldAll(
      [
        event({ id: "e1", amount: "2000000000000000000" }),
        event({
          id: "e2",
          type: "SPEND",
          amount: "1000000000000000000",
          counterparty: W2, // W2 never received it in the ledger
        }),
      ],
      ctx,
    );
    expect(state.realized).toHaveLength(0);
    expect(lotsTotal(state, W1, ETH)).toBe(2000000000000000000n);
  });

  it("conserves quantity: open lots equal the priced ledger net", () => {
    const events = [
      event({ id: "e1", amount: "5000000000000000000" }),
      event({
        id: "e2",
        timestamp: "2026-01-16T10:00:00.000Z",
        type: "SPEND",
        amount: "1000000000000000000",
        counterparty: "0xfeed",
      }),
      event({
        id: "e3",
        timestamp: "2026-01-17T10:00:00.000Z",
        amount: "2500000000000000000",
        counterparty: "0xfeed",
      }),
      event({
        id: "e4",
        timestamp: "2026-01-18T10:00:00.000Z",
        type: "SPEND",
        subtype: "FEE",
        amount: "500000000000000",
        counterparty: "uniswap-v2",
      }),
    ];
    const state = foldAll(events, ctx);
    const net =
      5000000000000000000n -
      1000000000000000000n +
      2500000000000000000n -
      500000000000000n;
    expect(lotsTotal(state, W1, ETH)).toBe(net);
  });

  it("counts unmatched spends and unpriceable rows without inventing zeros", () => {
    const state = foldAll(
      [
        event({
          id: "e1",
          type: "SPEND",
          amount: "1000000000000000000",
          counterparty: "0xfeed", // no lot behind it
        }),
        event({
          id: "e2",
          timestamp: "2026-01-16T10:00:00.000Z",
          valuation: null, // a receive nobody can price
        }),
      ],
      ctx,
    );
    expect(state.realized).toHaveLength(0);
    expect(state.unpriced.in).toBe(1);
    expect(state.unpriced.out).toBe(1);
    expect(state.months.size).toBe(1);
    const agg = state.months.get(`${W1}|2026-01`);
    expect(agg?.unpricedIn).toBe(1);
    expect(agg?.unpricedOut).toBe(1);
    expect(agg?.realized).toBe(0n);
  });

  it("records which legs it could not value, and why", () => {
    const state = foldAll(
      [
        event({ id: "e1", type: "SPEND", counterparty: "0xfeed" }), // no lot: no cost basis
        event({ id: "e2", timestamp: "2026-01-16T10:00:00.000Z", valuation: null }), // no value
        event({ id: "e3", timestamp: "2026-01-17T10:00:00.000Z" }), // priced: not listed
      ],
      ctx,
    );
    expect(state.unpricedLegs).toEqual([
      { wallet: W1, eventId: "e1", sequenceIndex: 0, asset: ETH, timestamp: "2026-01-15T10:00:00.000Z", reason: "basis" },
      { wallet: W1, eventId: "e2", sequenceIndex: 0, asset: ETH, timestamp: "2026-01-16T10:00:00.000Z", reason: "value" },
    ]);
    // One leg per counted gap: the list and the counters agree.
    expect(state.unpricedLegs).toHaveLength(state.unpriced.in + state.unpriced.out);
  });

  it("keeps the unpriced legs through the checkpoint, and reads an old one", () => {
    const state = foldAll([event({ id: "e2", valuation: null })], ctx);
    expect(deserializeFold(serializeFold(state)).unpricedLegs).toEqual(state.unpricedLegs);
    const old = JSON.parse(serializeFold(state)) as Record<string, unknown>;
    delete old.unpricedLegs;
    expect(deserializeFold(JSON.stringify(old)).unpricedLegs).toEqual([]);
  });

  it("prices income into the bucket and opens its lot at market", () => {
    const state = foldAll(
      [
        event({
          id: "e1",
          type: "STAKING",
          subtype: "BLOCK_PRODUCTION",
          amount: "3200000000000000",
          counterparty: null,
        }),
      ],
      ctx,
    );
    expect(state.income.get(`${W1}|BLOCK_PRODUCTION|2026-01`)?.toString()).toBe(
      "640000000", // 0.0032 ETH * 2000 = 6.4 EUR scaled 1e8
    );
    expect(month(state, W1, "income")).toBe(640000000n);
    expect(lotsTotal(state, W1, ETH)).toBe(3200000000000000n);
  });

  it("excludes ignored rows", () => {
    const state = foldAll(
      [
        event({ id: "e1", amount: "2000000000000000000" }),
        event({
          id: "e2",
          type: "SPEND",
          amount: "2000000000000000000",
          counterparty: "0xfeed",
          ignored: true,
        }),
      ],
      ctx,
    );
    expect(state.realized).toHaveLength(0);
    expect(lotsTotal(state, W1, ETH)).toBe(2000000000000000000n);
  });

  it("refolding an edited ledger equals a replay of the edit", () => {
    const base = [
      event({ id: "e1", amount: "2000000000000000000" }),
      event({
        id: "e2",
        timestamp: "2026-01-16T10:00:00.000Z",
        type: "SPEND",
        amount: "1000000000000000000",
        counterparty: "0xfeed",
      }),
    ];
    const once = foldAll(base, ctx);
    // The fee that was forgotten in the first import arrives corrected.
    const edited = [
      base[0],
      { ...base[1], valuation: { unit: "EUR", price: "3000", source: "COINGECKO" } },
    ];
    const twice = foldAll(edited, ctx);
    expect(once.realized[0].pnl).toBe("0");
    expect(twice.realized[0].pnl).toBe("100000000000"); // (3000-2000) EUR scaled 1e8
    expect(twice).not.toBe(once);
  });

  it("serializes through the checkpoint and back unchanged", () => {
    const state = foldAll(
      [
        event({ id: "e1", amount: "2000000000000000000" }),
        event({
          id: "e2",
          type: "SPEND",
          amount: "1000000000000000000",
          counterparty: "0xfeed",
        }),
      ],
      ctx,
    );
    const revived = deserializeFold(serializeFold(state));
    expect(serializeFold(revived)).toBe(serializeFold(state));
    expect(lotsTotal(revived, W1, ETH)).toBe(1000000000000000000n);
  });

  it("orders groups by timestamp before folding", () => {
    const groups = groupEvents([
      event({ id: "late", timestamp: "2026-02-01T00:00:00.000Z" }),
      event({ id: "early", timestamp: "2026-01-01T00:00:00.000Z" }),
      event({
        id: "early2",
        eventIdentifier: "tx-early",
        timestamp: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    expect(groups.map((group) => group.map((row) => row.id))).toEqual([
      ["early", "early2"],
      ["late"],
    ]);
  });
});
