import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumHoldingsFromLedgerAction } from "./holdings-from-ledger.js";

const get = vi.fn();

const ETH = "eip155:1/slip44:60";
const USDC = "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const SPAM = "eip155:1/erc20:0x9999999999999999999999999999999999999999";

const doc = (documentType: string, global: unknown) => ({
  header: { documentId: "d", documentType },
  state: { global },
});

const event = (
  type: string,
  asset: string,
  amount: string,
  over: Record<string, unknown> = {},
) => ({
  type,
  asset,
  amount,
  timestamp: "2026-01-01T00:00:00.000Z",
  ignored: false,
  ...over,
});

const walletA = doc("stackfolio/wallet-account", {
  ignored: false,
  backfill: { state: "DONE", nextBlock: null },
  ledger: [
    event("RECEIVE", ETH, "2000000000000000000"),
    event("SPEND", ETH, "500000000000000000"),
    event("SPEND", ETH, "21000000000000", { subtype: "FEE" }),
    event("RECEIVE", USDC, "1000000"),
    event("SPEND", ETH, "9000000000000000000", { ignored: true }),
    event("RECEIVE", SPAM, "500"),
    event("RECEIVE", ETH, "1000000000000000000", {
      timestamp: "2026-12-01T00:00:00.000Z",
    }),
  ],
});

const walletB = doc("stackfolio/wallet-account", {
  ignored: false,
  backfill: { state: "LOGS", nextBlock: 100 },
  ledger: [event("RECEIVE", ETH, "1000000000000000000")],
});

const portfolio = doc("stackfolio/portfolio", {
  ignoredAssets: [SPAM],
  priceOverrides: [],
});

const book = doc("stackfolio/price-book", {
  baseCurrency: "EUR",
  latest: [
    { asset: ETH, price: "2000" },
    { asset: USDC, price: "0.95" },
  ],
});

const registry = doc("stackfolio/asset-registry", {
  assets: [
    { identifier: ETH, symbol: "ETH", decimals: 18 },
    { identifier: USDC, symbol: "USDC", decimals: 6 },
    { identifier: SPAM, symbol: "SPAM", decimals: 18 },
  ],
});

const run = (props: Record<string, unknown> = {}) =>
  ethereumHoldingsFromLedgerAction.run({
    propsValue: {
      portfolioDocumentId: "p1",
      walletDocumentIdsJson: JSON.stringify(["w1", "w2"]),
      priceBookDocumentId: "b1",
      assetRegistryDocumentId: "r1",
      ...props,
    },
    auth: undefined,
    reactor: { get },
  } as unknown as Parameters<
    typeof ethereumHoldingsFromLedgerAction.run
  >[0]);

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((id: string) =>
    Promise.resolve(
      id === "p1"
        ? portfolio
        : id === "b1"
          ? book
          : id === "r1"
            ? registry
            : id === "w1"
              ? walletA
              : walletB,
    ),
  );
});

describe("holdings-from-ledger", () => {
  it("sums ledgers exactly, values through the book, flags gaps", async () => {
    const result = (await run({ asOf: "2026-11-11T00:00:00.000Z" })) as {
      holdings: Array<{ asset: string; amount: string; value: string | null; estimated: boolean }>;
      totalValue: string;
      incomplete: boolean;
    };

    const eth = result.holdings.find((h) => h.asset === ETH);
    const usdc = result.holdings.find((h) => h.asset === USDC);
    // Neither wallet carries an observed native balance, so ETH still
    // comes from the ledger: 2 - 0.5 - 0.000021 + 1 (wallet B, still
    // backfilling) = 2.499979
    expect(eth?.amount).toBe("2.499979");
    expect(eth?.value).toBe("4999.958");
    expect(eth?.estimated).toBe(true); // wallet B is mid-backfill
    expect(usdc).toMatchObject({ amount: "1", value: "0.95", estimated: false });
    // The ignored event, the portfolio-ignored SPAM asset and the
    // post-asOf receive are all absent.
    expect(result.holdings.find((h) => h.asset === SPAM)).toBeUndefined();
    expect(result.totalValue).toBe("5000.908");
    expect(result.incomplete).toBe(false);
  });

  it("lists ledger and position assets as identifiers to price", async () => {
    // The prices round fetches by this list; a debt token that exists only
    // in a position (never in a ledger) must appear, or the debts table
    // stays blank forever.
    get.mockImplementation((id: string) =>
      Promise.resolve(
        id === "p1"
          ? doc("stackfolio/portfolio", {
              ignoredAssets: [],
              priceOverrides: [],
              positions: [
                {
                  wallet: "0xaaa",
                  chainId: 1,
                  positions: [
                    {
                      protocol: "aave-v3",
                      kind: "SPOT",
                      assets: [
                        { asset: USDC, amount: "-51176182102" },
                        { asset: ETH, amount: "10062747000000000000" },
                      ],
                    },
                  ],
                },
              ],
            })
          : id === "b1"
            ? book
            : id === "r1"
              ? registry
              : id === "w1"
                ? walletA
                : walletB,
      ),
    );

    const result = (await run({ asOf: "2026-11-11T00:00:00.000Z" })) as {
      identifiers: string[];
    };

    // A borrowed stablecoin with no ledger row, and the dedup across
    // ledger and positions: exactly the union, no repeats.
    expect(result.identifiers).toContain(USDC);
    expect(result.identifiers.filter((a) => a === USDC)).toHaveLength(1);
    expect(result.identifiers).toContain(ETH);
    expect(result.identifiers.filter((a) => a === ETH)).toHaveLength(1);
  });

  it("reports a null value and incomplete when a price is missing", async () => {
    get.mockImplementation((id: string) =>
      Promise.resolve(
        id === "b1"
          ? doc("stackfolio/price-book", { baseCurrency: "EUR", latest: [{ asset: ETH, price: "2000" }] })
          : id === "p1"
            ? portfolio
            : id === "r1"
              ? registry
              : id === "w1"
                ? walletA
                : walletB,
      ),
    );

    const result = (await run({ asOf: "2026-11-11T00:00:00.000Z" })) as {
      holdings: Array<{ asset: string; value: string | null }>;
      totalValue: string;
      incomplete: boolean;
    };

    expect(result.holdings.find((h) => h.asset === USDC)?.value).toBeNull();
    expect(result.incomplete).toBe(true);
    expect(result.totalValue).toBe("4999.958");
  });

  it("prefers the observed native balance over the ledger sum", async () => {
    // A wallet whose native balance was read from the chain is ground
    // truth: the ledger cannot see internal transfers, so its ETH rows
    // under-count inflows and the raw sum falls below the real balance.
    get.mockImplementation((id: string) =>
      Promise.resolve(
        id === "p1"
          ? portfolio
          : id === "b1"
            ? book
            : id === "r1"
              ? registry
              : id === "w1"
                ? doc("stackfolio/wallet-account", {
                    ignored: false,
                    chainId: 1,
                    nativeBalance: {
                      amount: "1500000000000000000",
                      blockNumber: 21000000,
                    },
                    ledger: [
                      event("RECEIVE", ETH, "2000000000000000000"),
                      event("SPEND", ETH, "500000000000000000"),
                      event("RECEIVE", USDC, "1000000"),
                    ],
                  })
                : walletB,
      ),
    );

    const result = (await run({ asOf: "2026-11-11T00:00:00.000Z" })) as {
      holdings: Array<{ asset: string; amount: string; estimated: boolean }>;
    };

    // 1.5 observed for wallet A + 1 ledger-only from wallet B (it carries
    // no observation); wallet A's ledger ETH rows are not double-counted.
    const eth = result.holdings.find((h) => h.asset === ETH);
    expect(eth?.amount).toBe("2.5");
    expect(eth?.estimated).toBe(true); // wallet B is mid-backfill
  });

  it("skips the native observation for ignored assets", async () => {
    get.mockImplementation((id: string) =>
      Promise.resolve(
        id === "p1"
          ? doc("stackfolio/portfolio", {
              ignoredAssets: [ETH],
              priceOverrides: [],
            })
          : id === "b1"
            ? book
            : id === "r1"
              ? registry
              : id === "w1" || id === "w2"
                ? doc("stackfolio/wallet-account", {
                    ignored: false,
                    chainId: 1,
                    nativeBalance: { amount: "1", blockNumber: 1 },
                    ledger: [],
                  })
                : walletB,
      ),
    );

    const result = (await run()) as {
      holdings: Array<{ asset: string }>;
    };
    expect(result.holdings.find((h) => h.asset === ETH)).toBeUndefined();
  });

  it("prefers portfolio price overrides", async () => {
    get.mockImplementation((id: string) =>
      Promise.resolve(
        id === "p1"
          ? doc("stackfolio/portfolio", {
              ignoredAssets: [SPAM],
              priceOverrides: [{ asset: ETH, price: "1000" }],
            })
          : id === "b1"
            ? book
            : id === "r1"
              ? registry
              : id === "w1"
                ? walletA
                : walletB,
      ),
    );

    const result = (await run({ asOf: "2026-11-11T00:00:00.000Z" })) as {
      holdings: Array<{ asset: string; value: string | null }>;
    };

    expect(result.holdings.find((h) => h.asset === ETH)?.value).toBe("2499.979");
  });

  it("skips wallets flagged ignored", async () => {
    get.mockImplementation((id: string) =>
      Promise.resolve(
        id === "w2"
          ? doc("stackfolio/wallet-account", {
              ignored: true,
              backfill: { state: "LOGS" },
              ledger: [event("RECEIVE", ETH, "500000000000000000000")],
            })
          : id === "p1"
            ? portfolio
            : id === "b1"
              ? book
              : id === "r1"
                ? registry
                : walletA,
      ),
    );

    const result = (await run({ asOf: "2026-11-11T00:00:00.000Z" })) as {
      holdings: Array<{ asset: string; amount: string; estimated: boolean }>;
    };

    const eth = result.holdings.find((h) => h.asset === ETH);
    expect(eth?.amount).toBe("1.499979");
    expect(eth?.estimated).toBe(false);
  });
});
