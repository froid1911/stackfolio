import { describe, expect, it, vi } from "vitest";

import { fetchFxRates, fetchUsdCloses, llamaFallback, llamaKey, noonOf } from "./llama.js";

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

describe("llamaKey", () => {
  it("addresses tokens by chain and contract, natives by their coin", () => {
    expect(llamaKey("eip155:1/erc20:0xDAC17F958D2EE523A2206206994597C13D831EC7")).toBe(
      "ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7",
    );
    expect(llamaKey("eip155:137/erc20:0x2791bca1f2de4661ed88a30c99a7a9449aa84174")).toBe(
      "polygon:0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
    );
    expect(llamaKey("eip155:1/slip44:60")).toBe("coingecko:ethereum");
    expect(llamaKey("eip155:42161/slip44:60")).toBe("coingecko:ethereum");
    expect(llamaKey("eip155:137/slip44:60")).toBe("coingecko:polygon-ecosystem-token");
    expect(llamaKey("bip122:000000000019d6689c085ae165831e93/slip44:0")).toBe("coingecko:bitcoin");
  });

  it("falls back to a registry CoinGecko id, else has no key", () => {
    expect(llamaKey("eip155:999999/erc20:0xabc", "some-coin")).toBe("coingecko:some-coin");
    expect(llamaKey("eip155:999999/erc20:0xabc")).toBeNull();
  });
});

describe("llamaFallback", () => {
  it("names the canonical coin where a contract's history starts late", () => {
    // POL only trades from its 2023-24 rename; MATIC carries the years before.
    expect(llamaFallback("eip155:137/slip44:60")).toBe("coingecko:matic-network");
    expect(llamaFallback("eip155:137/erc20:0x8F3CF7AD23CD3CADBD9735AFF958023239C6A063")).toBe("coingecko:dai");
    expect(llamaFallback("eip155:137/erc20:0x28424507fefb6f7f8e9d3860f56504e4e5f5f390")).toBe(
      "coingecko:ethereum", // amWETH: 1:1 with its underlying
    );
    expect(llamaFallback("eip155:42161/erc20:0xff970a61a04b1ca14834a43f5de4533ebddb5cc")).toBe(
      "coingecko:usd-coin",
    );
  });

  it("has none for unknown contracts, mainnet ether or other ids", () => {
    expect(llamaFallback("eip155:137/erc20:0x1111111111111111111111111111111111111111")).toBeNull();
    expect(llamaFallback("eip155:1/slip44:60")).toBeNull();
    expect(llamaFallback("bip122:000000000019d6689c085ae165831e93/slip44:0")).toBeNull();
  });
});

describe("fetchUsdCloses", () => {
  it("batches days per coin and maps each answer back to its day", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const coins = JSON.parse(decodeURIComponent(url.split("coins=")[1])) as Record<string, number[]>;
      expect(coins["coingecko:ethereum"]).toEqual([noonOf("2021-03-01"), noonOf("2021-03-02")]);
      return json({
        coins: {
          "coingecko:ethereum": {
            symbol: "ETH",
            prices: [
              { timestamp: noonOf("2021-03-01") + 482, price: 1520.85, confidence: 0.99 },
              // 2021-03-02 has no answer: a definitive miss, not a failure.
            ],
          },
        },
      });
    });
    const result = await fetchUsdCloses(new Map([["coingecko:ethereum", ["2021-03-01", "2021-03-02"]]]), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.prices.get("coingecko:ethereum|2021-03-01")).toBe(1520.85);
    expect(result.prices.has("coingecko:ethereum|2021-03-02")).toBe(false);
    expect(result.failed.size).toBe(0);
  });

  it("ignores an answer from another day and low-confidence prices", async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        coins: {
          "ethereum:0xspam": { prices: [{ timestamp: noonOf("2021-03-01"), price: 9, confidence: 0.2 }] },
          "coingecko:ethereum": { prices: [{ timestamp: noonOf("2021-03-05"), price: 1, confidence: 0.99 }] },
        },
      }),
    );
    const result = await fetchUsdCloses(
      new Map([
        ["ethereum:0xspam", ["2021-03-01"]],
        ["coingecko:ethereum", ["2021-03-01"]],
      ]),
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(result.prices.size).toBe(0);
  });

  it("marks a coin failed when its request fails, so callers retry rather than pin", async () => {
    const fetchImpl = vi.fn(async () => json({ message: "Too Many Requests" }, 429));
    const result = await fetchUsdCloses(new Map([["coingecko:ethereum", ["2021-03-01"]]]), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect([...result.failed]).toEqual(["coingecko:ethereum"]);
    expect(result.prices.size).toBe(0);
  });
});

describe("fetchFxRates", () => {
  it("fills weekends and holidays from the previous business day", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("/v1/2020-12-25..2021-01-05?from=USD&to=EUR");
      return json({
        base: "USD",
        rates: { "2020-12-31": { EUR: 0.81493 }, "2021-01-04": { EUR: 0.81327 }, "2021-01-05": { EUR: 0.81493 } },
      });
    });
    const rate = await fetchFxRates("EUR", "2021-01-01", "2021-01-05", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(rate("2021-01-02")).toBe(0.81493); // Saturday → Thursday's rate
    expect(rate("2021-01-04")).toBe(0.81327);
    expect(rate("2020-12-01")).toBeNull(); // before the window
  });

  it("is 1 for USD and throws when the rates cannot be read", async () => {
    const usd = await fetchFxRates("USD", "2021-01-01", "2021-01-05", { fetchImpl: vi.fn() as unknown as typeof fetch });
    expect(usd("2021-01-02")).toBe(1);
    await expect(
      fetchFxRates("EUR", "2021-01-01", "2021-01-05", {
        fetchImpl: vi.fn(async () => json({}, 502)) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/exchange rates/);
  });
});
