import { describe, expect, it } from "vitest";
import { holdingsFromRows, type HoldingsInput } from "./lib.js";

const INPUT: HoldingsInput = {
  // Two wallets, two assets. Amounts are RAW token units as stored by the
  // ledger (events.amount), decimals from the registry, prices per WHOLE
  // unit at 8 decimals (prices_latest), overrides winning over latest.
  events: [
    { asset: "ETH", address: "0xw1", amount: "2000000000000000000", ignored: false }, // 2 ETH
    { asset: "ETH", address: "0xw2", amount: "1000000000000000000", ignored: false }, // 1 ETH
    { asset: "DAI", address: "0xw1", amount: "1000000000000000000", ignored: false }, // 1 DAI
    { asset: "ETH", address: "0xw1", amount: "500000000000000000", ignored: true }, // ignored: skipped
  ],
  decimals: { ETH: 18, DAI: 18 },
  prices: { ETH: "2000.00000000", DAI: "0.95000000" },
  overrides: {},
};

describe("holdingsFromRows", () => {
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
        { asset: "ETH", address: "0xw1", amount: "2000000000000000000", ignored: false },
        { asset: "ETH", address: "0xw1", amount: "-2000000000000000000", ignored: false },
      ],
    });
    expect(rows).toEqual([]);
  });

  it("unpriced or unregistered assets carry a null value, never a guess", () => {
    const rows = holdingsFromRows({
      ...INPUT,
      decimals: { ETH: 18 }, // DAI unregistered
      events: [
        { asset: "ETH", address: "0xw1", amount: "2000000000000000000", ignored: false },
        { asset: "MYST", address: "0xw1", amount: "7000000", ignored: false },
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
