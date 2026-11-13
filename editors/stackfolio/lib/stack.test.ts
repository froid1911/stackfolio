import { describe, expect, it } from "vitest";
import type { Asset } from "./graphql.js";
import { assetBook } from "./assets.js";
import { buildStack, isAaveReceipt, parseHealth } from "./stack.js";

function asset(identifier: string, symbol: string, decimals: number, extra: Partial<Asset> = {}): Asset {
  return {
    documentId: "doc",
    identifier,
    symbol,
    name: symbol,
    decimals,
    kind: "ERC20",
    chainId: 1,
    coingeckoId: "x",
    custom: false,
    ...extra,
  };
}

const ETH = "eip155:1/slip44:60";
const WBTC = "eip155:1/erc20:wbtc";
const AWBTC = "eip155:1/erc20:awbtc";
const DEBT = "eip155:1/erc20:vdusdt";
const USDT = "eip155:1/erc20:usdt";
const MYST = "eip155:1/erc20:myst";

const book = assetBook(
  [
    asset(ETH, "ETH", 18, { kind: "NATIVE" }),
    asset(WBTC, "WBTC", 8),
    asset(AWBTC, "aEthWBTC", 8),
    asset(DEBT, "variableDebtEthUSDT", 6),
    asset(USDT, "USDT", 6),
    asset(MYST, "MYST", 18, { coingeckoId: null }),
  ],
  [ETH, WBTC, AWBTC, USDT],
);

const prices = new Map([
  [ETH, "2000"],
  [WBTC, "60000"],
  [USDT, "0.9"],
]);

const W1 = "0xaaa";
const W2 = "0xbbb";

const input = {
  book,
  prices,
  holdings: [
    { asset: WBTC, wallet: W1, quantity: "1", value: "60000" },
    // The ledger's receipt tokens for W1: the protocol read replaces them.
    { asset: AWBTC, wallet: W1, quantity: "2.16", value: "129600" },
    { asset: DEBT, wallet: W1, quantity: "240679", value: null },
    // W2 has no Aave position, so its receipt token stays in the wallet.
    { asset: AWBTC, wallet: W2, quantity: "0.5", value: "30000" },
    { asset: MYST, wallet: W2, quantity: "7", value: null },
  ],
  positions: [
    {
      wallet: W1,
      chainId: 1,
      fetchedAt: "2026-11-13T15:00:00Z",
      positions: [
        { protocol: "aave-v3", kind: "SPOT", assets: [{ asset: WBTC, amount: "129470000" }], note: "supplied — health 1.63" },
        { protocol: "aave-v3", kind: "SPOT", assets: [{ asset: USDT, amount: "-37785619500" }], note: "borrowed" },
      ],
    },
  ],
  validators: [
    { index: 26871, balanceEth: 32.0035 },
    { index: 52483, balanceEth: 32.0034 },
  ],
};

describe("buildStack", () => {
  it("keeps receipt tokens out of a wallet the protocol read covers", () => {
    const stack = buildStack(input);
    const wallet = stack.groups.find((g) => g.kind === "wallet")!;
    expect(wallet.lines.map((l) => l.symbol)).toEqual(["WBTC", "aEthWBTC", "MYST"]);
    expect(wallet.lines.find((l) => l.symbol === "aEthWBTC")?.quantity).toBe("0.5");
    expect(wallet.net).toBeCloseTo(90000);
    expect(wallet.unpriced).toBe(1);
  });

  it("values a protocol from its positions: supplied, borrowed, net and health", () => {
    const aave = buildStack(input).groups.find((g) => g.kind === "protocol")!;
    expect(aave.label).toBe("Aave v3");
    expect(aave.supplied).toEqual([
      { asset: WBTC, symbol: "WBTC", quantity: "1.2947", value: 1.2947 * 60000 },
    ]);
    expect(aave.borrowed).toEqual([
      { asset: USDT, symbol: "USDT", quantity: "37785.6195", value: 37785.6195 * 0.9 },
    ]);
    expect(aave.net).toBeCloseTo(1.2947 * 60000 - 37785.6195 * 0.9);
    expect(aave.health).toBe(1.63);
  });

  it("adds staking at the ETH price, and a total over all groups", () => {
    const stack = buildStack(input);
    const staking = stack.groups.find((g) => g.kind === "staking")!;
    expect(staking.net).toBeCloseTo(64.0069 * 2000);
    expect(stack.total).toBeCloseTo(90000 + (1.2947 * 60000 - 37785.6195 * 0.9) + 64.0069 * 2000);
  });

  it("leaves an unpriced position out of the net and counts it", () => {
    const stack = buildStack({ ...input, prices: new Map([[ETH, "2000"], [WBTC, "60000"]]) });
    const aave = stack.groups.find((g) => g.kind === "protocol")!;
    expect(aave.borrowed[0]?.value).toBeNull();
    expect(aave.unpriced).toBe(1);
    expect(aave.net).toBeCloseTo(1.2947 * 60000);
  });

  it("omits staking without validators and protocols without positions", () => {
    const stack = buildStack({ ...input, positions: [], validators: [] });
    expect(stack.groups.map((g) => g.kind)).toEqual(["wallet"]);
  });
});

describe("helpers", () => {
  it("recognises Aave receipts and debt tokens", () => {
    expect(isAaveReceipt("aEthWBTC")).toBe(true);
    expect(isAaveReceipt("aPolUSDC")).toBe(true);
    expect(isAaveReceipt("variableDebtEthUSDT")).toBe(true);
    expect(isAaveReceipt("AAVE")).toBe(false);
    expect(isAaveReceipt("aave")).toBe(false);
  });

  it("parses a health factor out of a position note", () => {
    expect(parseHealth("supplied — health 1.63")).toBe(1.63);
    expect(parseHealth("borrowed")).toBeNull();
    expect(parseHealth(null)).toBeNull();
  });
});
