import { describe, expect, it } from "vitest";
import { holdingsFromRows, type HoldingsInput } from "./lib.js";

const INPUT: HoldingsInput = {
  // Two wallets, two assets. Amounts are RAW token units as stored by the
  // ledger (events.amount), decimals from the registry, prices per WHOLE
  // unit at 8 decimals (prices_latest), overrides winning over latest.
  events: [
    { asset: "ETH", address: "0xw1", amount: "2000000000000000000", ignored: false, type: "RECEIVE" }, // 2 ETH
    { asset: "ETH", address: "0xw2", amount: "1000000000000000000", ignored: false, type: "RECEIVE" }, // 1 ETH
    { asset: "DAI", address: "0xw1", amount: "1000000000000000000", ignored: false, type: "RECEIVE" }, // 1 DAI
    { asset: "ETH", address: "0xw1", amount: "500000000000000000", ignored: true, type: "RECEIVE" }, // ignored: skipped
  ],
  decimals: { ETH: 18, DAI: 18 },
  prices: { ETH: "2000.00000000", DAI: "0.95000000" },
  overrides: {},
};

describe("holdingsFromRows", () => {
  // The ledger stores unsigned amounts; the event type carries direction,
  // as in pieces/ethereum's holdings-from-ledger (the snapshot's fold).
  it("subtracts SPEND and adds RECEIVE and STAKING, from unsigned amounts", () => {
    const rows = holdingsFromRows({
      ...INPUT,
      events: [
        { asset: "ETH", address: "0xw1", amount: "3000000000000000000", ignored: false, type: "RECEIVE" },
        { asset: "ETH", address: "0xw1", amount: "1000000000000000000", ignored: false, type: "SPEND" },
        { asset: "ETH", address: "0xw1", amount: "500000000000000000", ignored: false, type: "STAKING" },
      ],
    });
    expect(rows).toEqual([{ asset: "ETH", wallet: "0xw1", quantity: "2.5", value: "5000" }]);
  });

  it("skips types that do not move a balance", () => {
    const rows = holdingsFromRows({
      ...INPUT,
      events: ["TRADE", "TRANSFER", "MIGRATE", "INFORMATIONAL"].map((type) => ({
        asset: "ETH",
        address: "0xw1",
        amount: "1000000000000000000",
        ignored: false,
        type,
      })),
    });
    expect(rows).toEqual([]);
  });

  it("nets an Aave debt token's borrows against its repayments", () => {
    const e = (amount: string, type: string) => ({ asset: "DEBT", address: "0xw1", amount, ignored: false, type });
    const rows = holdingsFromRows({
      ...INPUT,
      decimals: { DEBT: 6 },
      prices: {},
      events: [e("1333013000000", "RECEIVE"), e("111000000000", "RECEIVE"), e("1203334000000", "SPEND")],
    });
    // Summing unsigned amounts gave 2,647,347: the repayments added on.
    expect(rows).toEqual([{ asset: "DEBT", wallet: "0xw1", quantity: "240679", value: null }]);
  });

  it("an observed balance replaces that wallet's ledger net for the asset", () => {
    const rows = holdingsFromRows({
      ...INPUT,
      events: [
        // Native transfers are in the ledger AND the account has a balance:
        // counting both doubles the ETH.
        { asset: "ETH", address: "0xw1", amount: "5000000000000000000", ignored: false, type: "RECEIVE" },
        { asset: "ETH", address: "0xw2", amount: "1000000000000000000", ignored: false, type: "RECEIVE" },
      ],
      balances: [{ asset: "ETH", address: "0xw1", amount: "2000000000000000000" }],
    });
    expect(rows).toEqual([
      { asset: "ETH", wallet: "0xw1", quantity: "2", value: "4000" },
      { asset: "ETH", wallet: "0xw2", quantity: "1", value: "2000" },
    ]);
  });

  it("folds per wallet and asset, exact decimals", () => {
    const rows = holdingsFromRows(INPUT);
    expect(rows).toEqual([
      { asset: "DAI", wallet: "0xw1", quantity: "1", value: "0.95" },
      { asset: "ETH", wallet: "0xw1", quantity: "2", value: "4000" },
      { asset: "ETH", wallet: "0xw2", quantity: "1", value: "2000" },
    ]);
  });

  it("zero net balances drop out", () => {
    const rows = holdingsFromRows({
      ...INPUT,
      events: [
        { asset: "ETH", address: "0xw1", amount: "2000000000000000000", ignored: false, type: "RECEIVE" },
        { asset: "ETH", address: "0xw1", amount: "2000000000000000000", ignored: false, type: "SPEND" },
      ],
    });
    expect(rows).toEqual([]);
  });

  it("unpriced or unregistered assets carry a null value, never a guess", () => {
    const rows = holdingsFromRows({
      ...INPUT,
      decimals: { ETH: 18 }, // DAI unregistered
      events: [
        { asset: "ETH", address: "0xw1", amount: "2000000000000000000", ignored: false, type: "RECEIVE" },
        { asset: "MYST", address: "0xw1", amount: "7000000", ignored: false, type: "RECEIVE" },
      ],
      prices: { ETH: "2000.00000000" },
    });
    expect(rows).toEqual([
      { asset: "ETH", wallet: "0xw1", quantity: "2", value: "4000" },
      { asset: "MYST", wallet: "0xw1", quantity: "7000000", value: null },
    ]);
  });

  it("a portfolio override beats the latest price", () => {
    const rows = holdingsFromRows({
      ...INPUT,
      overrides: { DAI: "1.00000000" },
    });
    const dai = rows.filter((r) => r.asset === "DAI");
    expect(dai.map((r) => r.value)).toEqual(["1"]);
  });

  it("buildBalances pivots rows to per-asset, per-account and the total", async () => {
    const { buildBalances } = await import("./lib.js");
    const rows = holdingsFromRows(INPUT);
    const totals = buildBalances(rows);
    // 2 ETH + 1 ETH + 1 DAI = 6000 + 0.95. (4000.95 was wrong here: the
    // 5e17 event is ignored, so 0xw1 holds 2 ETH, not 2.5.)
    expect(totals.total).toBe("6000.95");
    expect(totals.perAsset).toEqual([
      { asset: "DAI", quantity: "1", value: "0.95" },
      { asset: "ETH", quantity: "3", value: "6000" },
    ]);
    expect(totals.perAccount).toEqual([
      { wallet: "0xw1", value: "4000.95" },
      { wallet: "0xw2", value: "2000" },
    ]);
  });

  it("sums decimals exactly: 0.1 + 0.2 = 0.3", async () => {
    const { buildBalances } = await import("./lib.js");
    const totals = buildBalances([
      { asset: "A", wallet: "w1", quantity: "0.1", value: "0.1" },
      { asset: "A", wallet: "w2", quantity: "0.2", value: "0.2" },
    ]);
    expect(totals.total).toBe("0.3");
    expect(totals.perAsset[0].value).toBe("0.3");
  });

  it("null-valued rows keep the asset in perAsset with a null value", async () => {
    const { buildBalances } = await import("./lib.js");
    const totals = buildBalances([
      { asset: "X", wallet: "w1", quantity: "5", value: null },
    ]);
    expect(totals.perAsset).toEqual([{ asset: "X", quantity: "5", value: null }]);
    expect(totals.total).toBe("0");
  });
});
