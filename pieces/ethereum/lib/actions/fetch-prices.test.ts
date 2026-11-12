import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumFetchPricesAction } from "./fetch-prices.js";

const ETH = "eip155:1/slip44:60";
const USDC = "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const UNKNOWN = "eip155:1/erc20:0x9999999999999999999999999999999999999999";
const HOUR = "2026-11-11T10:00:00.000Z";

const registryJson = JSON.stringify({
  assets: [
    { identifier: ETH, coingeckoId: "ethereum" },
    { identifier: USDC, coingeckoId: "usd-coin" },
  ],
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const runAction = async (
  identifiers: string[],
  registry: string | null | undefined,
  props: Record<string, unknown> = {},
) =>
  (await ethereumFetchPricesAction.run({
    propsValue: {
      assetIdentifiersJson: JSON.stringify(identifiers),
      hour: HOUR,
      registryJson: registry ?? null,
      coingeckoBaseUrl: "https://api.coingecko.com/api/v3",
      vsCurrency: "EUR",
      ...props,
    },
    auth: { props: {} },
  } as unknown as Parameters<
    typeof ethereumFetchPricesAction.run
  >[0])) as {
    prices: Array<{
      asset: string;
      price: string;
      source: string;
      hour: string;
    }>;
    error: string | null;
  };

beforeEach(() => {
  fetchMock.mockReset();
});

describe("fetch-prices", () => {
  it("prices the native coin and registry-mapped tokens, honoring the hour", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("ids=ethereum")) {
        return {
          ok: true,
          json: () => ({ ethereum: { eur: 2950.1 } }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await runAction([ETH], registryJson);

    expect(result.error).toBeNull();
    expect(result.prices).toEqual([
      { asset: ETH, price: "2950.1", source: "COINGECKO", hour: HOUR },
    ]);
  });

  it("reads holdings rows, not only bare identifier strings", async () => {
    // The workflow feeds {{steps.holdings.output.holdings}} - objects with
    // an asset field - and a silently-ignored row is how a whole price
    // round ends up empty.
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("ids=ethereum")) {
        return { ok: true, json: () => ({ ethereum: { eur: 2950.1 } }) };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = (await ethereumFetchPricesAction.run({
      propsValue: {
        assetIdentifiersJson: JSON.stringify([
          { asset: ETH, symbol: "ETH", amount: "1.5", value: null },
          { asset: 42 },
        ]),
        hour: HOUR,
        registryJson,
        coingeckoBaseUrl: "https://api.coingecko.com/api/v3",
        vsCurrency: "EUR",
      },
      auth: { props: {} },
    } as unknown as Parameters<
      typeof ethereumFetchPricesAction.run
    >[0])) as {
      prices: Array<{ asset: string }>;
      error: string | null;
    };

    expect(result.prices.map((p) => p.asset)).toEqual([ETH]);
    expect(result.error).toBeNull();
  });

  it("maps a registry-less token through its contract address", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (
        url.includes(
          "contract_addresses=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        )
      ) {
        return Promise.resolve({
          ok: true,
          json: () => ({
            "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { eur: 1.0002 },
          }),
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await runAction([USDC], null);

    expect(result.prices).toEqual([
      { asset: USDC, price: "1.0002", source: "COINGECKO", hour: HOUR },
    ]);
  });

  it("prefers the registry coingeckoId over address lookup", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("ids=usd-coin")) {
        return Promise.resolve({
          ok: true,
          json: () => ({ "usd-coin": { eur: 0.95 } }),
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await runAction([USDC], registryJson);

    expect(result.prices).toEqual([
      { asset: USDC, price: "0.95", source: "COINGECKO", hour: HOUR },
    ]);
  });

  it("expands exponent-form dust prices to plain decimals", async () => {
    // Dead tokens answer 1.084e-9; the price book reducer rejects exponent
    // text and the whole RECORD_PRICES used to fail on it.
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("contract_addresses=")) {
        return {
          ok: true,
          json: () => ({
            "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { eur: 1.084e-9 },
          }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = await runAction([USDC], null);

    expect(result.prices).toEqual([
      { asset: USDC, price: "0.000000001084", source: "COINGECKO", hour: HOUR },
    ]);
    expect(result.error).toBeNull();
  });

  it("never invents a price: unmapped assets surface in error", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => ({}) }));

    const result = await runAction([UNKNOWN], registryJson);

    expect(result.prices).toEqual([]);
    expect(result.error).toContain(UNKNOWN);
  });

  it("reports a failed coingecko call as error, not as rows", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });

    // The action backs off 2s/4s/8s on rate-limit answers; let those
    // timers fire instantly.
    vi.useFakeTimers();
    const running = runAction([ETH], registryJson);
    await vi.runAllTimersAsync();
    const result = await running;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(4); // one try, three retries
    expect(result.prices).toEqual([]);
    expect(result.error).toContain("429");
  });

  it("rejects malformed identifier lists", async () => {
    await expect(
      ethereumFetchPricesAction.run({
        propsValue: {
          assetIdentifiersJson: "nope",
          hour: HOUR,
          registryJson: null,
          coingeckoBaseUrl: "https://api.coingecko.com/api/v3",
          vsCurrency: "EUR",
        },
        auth: { props: {} },
      } as unknown as Parameters<
        typeof ethereumFetchPricesAction.run
      >[0]),
    ).rejects.toThrow(/assetIdentifiersJson/);
  });
});
