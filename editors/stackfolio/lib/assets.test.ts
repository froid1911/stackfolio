import { describe, expect, it } from "vitest";

import type { Asset, HoldingRow } from "./graphql.js";
import {
  allocate,
  ambiguousTicker,
  assetBook,
  chainLabel,
  chainOf,
  isDebtToken,
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

describe("looksSpoofed: URL-bait airdrops", () => {
  it("flags lures, links and scam-domain tickers seen in the registry", () => {
    expect(looksSpoofed({ symbol: "880$ Visit unibonus.site to claim", name: "unibonus.site" })).toBe(true);
    expect(looksSpoofed({ symbol: "BalancerLP.com", name: "$" })).toBe(true);
    expect(looksSpoofed({ symbol: "BPrize", name: "BirdsPrize.club" })).toBe(true);
    expect(looksSpoofed({ symbol: "RWD", name: "Claim your reward at t.me/x" })).toBe(true);
    expect(looksSpoofed({ symbol: "GIFT", name: "www.gift.io" })).toBe(true);
  });

  it("keeps real tokens, including .finance project names", () => {
    for (const asset of [
      { symbol: "FAM", name: "yefam.finance" },
      { symbol: "DIXT", name: "DIXT.FINANCE" },
      { symbol: "YFIB", name: "YFIBALANCER.FINANCE" },
      { symbol: "rETH", name: "Rocket Pool ETH" },
      { symbol: "crvPlain3andSUSD", name: "Curve.fi DAI/USDC/USDT/sUSD" },
      { symbol: "aEthWBTC", name: "Aave Ethereum WBTC" },
      { symbol: "BAL", name: "Balancer" },
    ]) {
      expect(looksSpoofed(asset), asset.symbol).toBe(false);
    }
  });
});

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

describe("allocate", () => {
  const book = assetBook(
    [
      asset({ identifier: "eth", symbol: "ETH", kind: "NATIVE" }),
      asset({ identifier: "usdc", symbol: "USDC", coingeckoId: "usd-coin" }),
      asset({ identifier: "spoof", symbol: "USD\u0422", name: "Tether" }),
      asset({ identifier: "dust", symbol: "DUST" }),
    ],
    ["eth", "usdc", "spoof"],
  );
  const perAsset = [
    { asset: "usdc", quantity: "1000", value: "1000.5" },
    { asset: "eth", quantity: "2", value: "6000.25" },
    { asset: "spoof", quantity: "1000000", value: "999999" },
    { asset: "dust", quantity: "12", value: null },
  ];

  it("sorts valued holdings by value and keeps spoofs out of the total", () => {
    const a = allocate(perAsset, book);
    expect(a.valued.map((r) => r.asset)).toEqual(["eth", "usdc"]);
    expect(a.unpriced.map((r) => r.asset)).toEqual(["dust"]);
    expect(a.spam.map((r) => r.asset)).toEqual(["spoof"]);
    expect(a.total).toBe("7000.75");
  });

  it("derives shares and slices from that same total", () => {
    const a = allocate(perAsset, book);
    expect(a.share("eth")).toBeCloseTo(6000.25 / 7000.75);
    expect(a.share("spoof")).toBeNull();
    expect(a.slices).toEqual([
      { label: "ETH", value: 6000.25 },
      { label: "USDC", value: 1000.5 },
    ]);
  });

  it("folds the tail into Other", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      asset: `t${i}`,
      quantity: "1",
      value: String(10 - i),
    }));
    const a = allocate(many, assetBook([], []), 3);
    expect(a.slices.map((s) => s.label)).toEqual(["t0", "t1", "t2", "Other"]);
    expect(a.slices.at(-1)?.value).toBe(7 + 6 + 5 + 4 + 3 + 2 + 1);
    expect(a.total).toBe("55");
  });

  it("answers zero for an empty portfolio", () => {
    const a = allocate([], book);
    expect(a.total).toBe("0");
    expect(a.slices).toEqual([]);
  });
});

describe("chainOf", () => {
  it("prefers the registry entry, else reads the CAIP identifier", () => {
    const book = new Map([["x", asset({ identifier: "x", chainId: 8453 })]]);
    expect(chainOf(book, "x")).toBe("Base");
    expect(chainOf(book, "eip155:42161/erc20:0xabc")).toBe("Arbitrum");
    expect(chainOf(book, "bip122:000000000019d6689c085ae165831e93/slip44:0")).toBe("Bitcoin");
    expect(chainOf(book, "mystery")).toBe("unknown chain");
  });
});

describe("debt tokens", () => {
  it("recognises Aave-style debt tickers", () => {
    expect(isDebtToken("variableDebtEthUSDT")).toBe(true);
    expect(isDebtToken("stableDebtEthDAI")).toBe(true);
    expect(isDebtToken("aEthUSDT")).toBe(false);
    expect(isDebtToken("DEBT")).toBe(false);
  });

  it("keeps debt out of assets and the total, priced or not", () => {
    const book = assetBook(
      [
        asset({ identifier: "usdt", symbol: "USDT", coingeckoId: "tether" }),
        asset({ identifier: "debt", symbol: "variableDebtEthUSDT" }),
        asset({ identifier: "dust", symbol: "DUST" }),
      ],
      ["usdt"],
    );
    const a = allocate(
      [
        { asset: "usdt", quantity: "10", value: "10" },
        { asset: "debt", quantity: "4", value: null },
        { asset: "dust", quantity: "1", value: null },
      ],
      book,
    );
    expect(a.debt.map((r) => r.asset)).toEqual(["debt"]);
    expect(a.unpriced.map((r) => r.asset)).toEqual(["dust"]);
    expect(a.total).toBe("10");
  });
});

describe("negative nets", () => {
  it("keeps an impossible negative holding out of the total and lists it", () => {
    const book = assetBook(
      [
        asset({ identifier: "eth", symbol: "ETH", kind: "NATIVE" }),
        asset({ identifier: "wst", symbol: "wstETH", coingeckoId: "wsteth" }),
        asset({ identifier: "dai", symbol: "DAI", coingeckoId: "dai" }),
      ],
      ["eth", "wst", "dai"],
    );
    const a = allocate(
      [
        { asset: "eth", quantity: "1", value: "1754.28" },
        { asset: "wst", quantity: "-34.134", value: "-74813.44" },
        { asset: "dai", quantity: "-12", value: null },
      ],
      book,
    );
    expect(a.total).toBe("1754.28");
    expect(a.negative.map((r) => r.asset)).toEqual(["wst", "dai"]);
    expect(a.valued.map((r) => r.asset)).toEqual(["eth"]);
    expect(a.unpriced).toEqual([]);
    expect(a.share("wst")).toBeNull();
  });
});
