import { describe, expect, it } from "vitest";
import { classify, overrideKey, txHashOf, type ClassifyEvent } from "./categories.js";

const W = "0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50";
const OWN = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const BINANCE = "0x28c6c06298d514db089934071355e5743bf21d60";
const STRANGER = "0x9999999999999999999999999999999999999999";
const TX = `0x${"a".repeat(64)}`;
const ETH = "eip155:1/slip44:60";
const USDT = "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7";

const ev = (over: Partial<ClassifyEvent> & { id: string }): ClassifyEvent => ({
  wallet: W, eventIdentifier: TX, sequenceIndex: 0, type: "SPEND", subtype: "NONE",
  asset: ETH, amount: "1", counterparty: STRANGER, chainId: 1, ...over,
});
const ctx = (over: Partial<Parameters<typeof classify>[1]> = {}) => ({
  knownAddresses: new Set([W, OWN]), rules: [], overrides: new Map(), ...over,
});
const one = (event: ClassifyEvent, c = ctx()) => classify([event], c).get(overrideKey(event.wallet, event.id, event.sequenceIndex));

describe("txHashOf", () => {
  it("strips a decoder's log suffix", () => {
    expect(txHashOf(`${TX}-165`)).toBe(TX);
    expect(txHashOf(TX)).toBe(TX);
    expect(txHashOf("withdrawal-123")).toBe("withdrawal-123");
  });
});

describe("classify", () => {
  it("leaves a transfer to a stranger unclassified", () => {
    expect(one(ev({ id: "e1" }))).toEqual({ category: "UNCLASSIFIED", source: "unclassified", giftCost: null, giftAcquiredAt: null });
  });

  it("books moves between own wallets as withdrawal and deposit", () => {
    expect(one(ev({ id: "e1", counterparty: OWN }))?.category).toBe("WITHDRAWAL");
    expect(one(ev({ id: "e2", type: "RECEIVE", counterparty: OWN }))?.category).toBe("DEPOSIT");
  });

  it("derives protocol categories from the decoder's subtypes", () => {
    const cases: Array<[string, string, string]> = [
      ["SPEND", "DEPOSIT_ASSET", "COLLATERAL_OUT"],
      ["RECEIVE", "REMOVE_ASSET", "COLLATERAL_IN"],
      ["RECEIVE", "WITHDRAWAL", "COLLATERAL_IN"],
      ["RECEIVE", "BORROW", "BORROWING"],
      ["SPEND", "REPAY", "LOAN_REPAYMENT"],
      ["SPEND", "LIQUIDATION", "LIQUIDATION"],
      ["RECEIVE", "YIELD", "LENDING_INCOME"],
      ["RECEIVE", "AIRDROP", "AIRDROP"],
      ["STAKING", "BLOCK_PRODUCTION", "STAKING"],
      ["SPEND", "FEE", "FEE"],
      ["SPEND", "LP_MINT", "COLLATERAL_OUT"],
      ["RECEIVE", "LP_BURN", "COLLATERAL_IN"],
      ["SPEND", "NAME_REGISTRATION", "FEE"],
    ];
    for (const [type, subtype, category] of cases) {
      expect(one(ev({ id: `${type}-${subtype}`, type, subtype, counterparty: "aave-v3" }))?.category, `${type}/${subtype}`).toBe(category);
    }
  });

  it("books a beacon withdrawal as staking, and a 16 ETH one as the stake returning", () => {
    const skim = ev({ id: "w1", eventIdentifier: "withdrawal-1", type: "STAKING", subtype: "WITHDRAWAL", counterparty: W, amount: "12000000000000000" });
    expect(one(skim)?.category).toBe("STAKING");
    expect(one({ ...skim, id: "w2", amount: "32000000000000000000" })?.category).toBe("COLLATERAL_IN");
  });

  it("calls a transaction trade when one wallet sends one asset and receives another", () => {
    const out = ev({ id: "o", eventIdentifier: TX, sequenceIndex: 3, asset: USDT, counterparty: "uniswap-v2" });
    const inn = ev({ id: "i", eventIdentifier: `${TX}-9`, sequenceIndex: 9, type: "RECEIVE", asset: ETH, counterparty: STRANGER });
    const result = classify([out, inn], ctx());
    expect(result.get(overrideKey(W, "o", 3))?.category).toBe("TRADE");
    expect(result.get(overrideKey(W, "i", 9))?.category).toBe("TRADE");
  });

  it("applies the most specific matching rule, newest first among equals", () => {
    const rules = [
      { id: "r1", counterparty: BINANCE, chainId: null, direction: "ANY", asset: null, category: "GIFT_OUT", label: null },
      { id: "r2", counterparty: BINANCE, chainId: 1, direction: "OUT", asset: null, category: "WITHDRAWAL", label: null },
      { id: "r3", counterparty: BINANCE, chainId: null, direction: "IN", asset: null, category: "DEPOSIT", label: null },
    ];
    const out = one(ev({ id: "e1", counterparty: BINANCE.toUpperCase().replace("0X", "0x") }), ctx({ rules }));
    expect(out).toMatchObject({ category: "WITHDRAWAL", source: "rule" });
    expect(one(ev({ id: "e2", type: "RECEIVE", counterparty: BINANCE }), ctx({ rules }))?.category).toBe("DEPOSIT");
  });

  it("lets an override win over a rule and an automatic default, carrying gift basis", () => {
    const overrides = new Map([[overrideKey(W, "e1", 0), { category: "GIFT_IN", giftCost: "100", giftAcquiredAt: "2022-01-01T00:00:00.000Z" }]]);
    const rules = [{ id: "r", counterparty: OWN, chainId: null, direction: "ANY", asset: null, category: "TRADE", label: null }];
    expect(one(ev({ id: "e1", type: "RECEIVE", counterparty: OWN }), ctx({ rules, overrides }))).toEqual({
      category: "GIFT_IN", source: "override", giftCost: "100", giftAcquiredAt: "2022-01-01T00:00:00.000Z",
    });
  });
});
