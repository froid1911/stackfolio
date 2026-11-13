import { describe, expect, it } from "vitest";

import type { Asset, HoldingRow } from "./graphql.js";
import {
  ambiguousTicker,
  assetBook,
  chainLabel,
  coverage,
  formatQuantity,
  formatUnitPrice,
  looksSpoofed,
  shortIdentifier,
  tierCounts,
} from "./assets.js";

function asset(over: Partial<Asset> & Pick<Asset, "identifier">): Asset {
  return {
    documentId: "doc",
    symbol: "TKN",
    name: "Token",
    decimals: 18,
    kind: "ERC20",
    chainId: 1,
    coingeckoId: null,
    custom: false,
    ...over,
  };
}

describe("looksSpoofed", () => {
  it("refuses mixed-script and invisible tickers", () => {
    expect(looksSpoofed({ symbol: "DAI", name: "Dai Stablecoin" })).toBe(false);
    expect(looksSpoofed({ symbol: "DA\u0406", name: "Dai" })).toBe(true);
    expect(looksSpoofed({ symbol: "USD\u0422", name: "Tether" })).toBe(true);
    expect(looksSpoofed({ symbol: "US\u200BDT", name: "Tether" })).toBe(true);
    expect(looksSpoofed({ symbol: "U\u0301SDC", name: "USD Coin" })).toBe(true);
  });
});

describe("assetBook", () => {
  const real = asset({ identifier: "eip155:1/erc20:0x6b17", symbol: "DAI", coingeckoId: "dai" });
  const spoof = asset({ identifier: "eip155:1/erc20:0xdead", symbol: "DA\u0406", name: "Dai" });
  const native = asset({ identifier: "eip155:1/slip44:60", symbol: "ETH", kind: "NATIVE" });

  it("tiers verified, unverified and spam, and flags repeated tickers", () => {
    const book = assetBook([real, spoof, native], [real.identifier]);
    expect(book.rows.map((r) => r.tier)).toEqual(["verified", "spam", "verified"]);
    expect(book.rows[0]?.priced).toBe(true);
    expect(tierCounts(book.rows)).toEqual({ verified: 2, unverified: 0, spam: 1 });
    const ambiguous = assetBook(
      [asset({ identifier: "a", symbol: "USDT" }), asset({ identifier: "b", symbol: "USDT" })],
      [],
    );
    expect(ambiguous.rows[0] && ambiguousTicker(ambiguous.rows[0])).toBe(true);
  });
});

describe("coverage", () => {
  it("counts unpriced assets once and their rows", () => {
    const rows: HoldingRow[] = [
      { asset: "a", symbol: "A", wallet: "w1", quantity: "1", value: "2" },
      { asset: "b", symbol: "B", wallet: "w1", quantity: "3", value: null },
      { asset: "b", symbol: "B", wallet: "w2", quantity: "4", value: null },
    ];
    expect(coverage(rows, "2")).toMatchObject({
      assets: 2,
      pricedAssets: 1,
      unpricedAssets: 1,
      unpricedRows: 2,
      pricedValue: "2",
    });
  });
});

describe("formatting", () => {
  it("shows quantities with grouping and no raw tails", () => {
    expect(formatQuantity("86294.634289559666984651")).toBe("86,294.63429");
    expect(formatQuantity("0.000000000000000002")).toBe(">0");
    expect(formatQuantity("14000")).toBe("14,000");
  });

  it("keeps precision for sub-unit prices", () => {
    expect(formatUnitPrice("0.00000123")).toBe("0.000001");
    expect(formatUnitPrice("1815.13")).toBe("1,815.13");
  });

  it("names chains and shortens identifiers", () => {
    expect(chainLabel(42161)).toBe("Arbitrum");
    expect(chainLabel(77)).toBe("chain 77");
    expect(shortIdentifier("eip155:1/slip44:60")).toBe("slip44:60");
    expect(shortIdentifier("eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f")).toBe("0x6b17…1d0f");
  });
});
