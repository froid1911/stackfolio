import { beforeEach, describe, expect, it, vi } from "vitest";

import { noonOf } from "../llama.js";
import { ethereumPinPricesAction } from "./pin-prices.js";

const event = (
  id: string,
  asset: string,
  timestamp: string,
  valuation: unknown,
) => ({
  id,
  eventIdentifier: `0x${id}`,
  sequenceIndex: 0,
  timestamp,
  type: "SPEND",
  subtype: "NONE",
  asset,
  amount: "1",
  counterparty: null,
  counterpartyLabel: null,
  notes: null,
  ignored: false,
  source: "CHAIN",
  importBatch: "b1",
  valuation,
});

const ETH = "eip155:1/slip44:60";
const USDT = "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7";
const SPAM = "eip155:1/erc20:0x1111111111111111111111111111111111111111";
const manual = { unit: "EUR", price: "1", source: "MANUAL", granularity: "NONE", pinnedAt: "2026-11-01T00:00:00.000Z" };
/** What the broken CoinGecko path pinned for every row. */
const stuck = { unit: "EUR", price: "0", source: "UNPRICED", granularity: "DAY", pinnedAt: "2026-11-12T00:00:00.000Z" };

const ledger = [
  event("e1", ETH, "2021-03-01T10:00:00.000Z", null),
  event("e2", ETH, "2021-03-01T18:00:00.000Z", null),
  event("e3", USDT, "2021-03-01T09:00:00.000Z", stuck),
  event("e4", ETH, "2021-03-02T10:00:00.000Z", manual),
  event("e5", SPAM, "2021-03-01T12:00:00.000Z", null),
];

const walletDoc = (rows = ledger) => ({
  header: { documentType: "stackfolio/wallet-account" },
  state: { global: { address: "0xabc", chainId: 1, ledger: rows } },
});

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

/** Real response shapes: DefiLlama batchHistorical and Frankfurter v1. */
function apis(over: { llama?: (coins: Record<string, number[]>) => Response; fx?: () => Response } = {}) {
  return vi.fn(async (url: string) => {
    if (url.includes("frankfurter")) {
      return over.fx?.() ?? json({ base: "USD", rates: { "2021-03-01": { EUR: 0.82967 }, "2021-03-02": { EUR: 0.8301 } } });
    }
    if (url.includes("coins.llama.fi/batchHistorical")) {
      const coins = JSON.parse(decodeURIComponent(url.split("coins=")[1])) as Record<string, number[]>;
      if (over.llama) return over.llama(coins);
      return json({
        coins: {
          "coingecko:ethereum": { prices: [{ timestamp: noonOf("2021-03-01") + 482, price: 1520.85, confidence: 0.99 }] },
          "ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7": {
            prices: [{ timestamp: noonOf("2021-03-01") + 27, price: 1.003, confidence: 0.99 }],
          },
          // The spam token: answered, but without a price.
        },
      });
    }
    throw new Error(`unexpected url ${url}`);
  });
}

const execute = vi.fn().mockResolvedValue({});
const get = vi.fn();

const run = (props: Record<string, unknown>) =>
  ethereumPinPricesAction.run({
    propsValue: { documentId: "w1", max: 50, now: "2026-11-14T12:00:00.000Z", ...props },
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<typeof ethereumPinPricesAction.run>[0]);

type Pinned = { id: string; valuation: { price: string; source: string; granularity: string; unit: string } };
const pinned = () => {
  const actions = execute.mock.calls[0]?.[2] as Array<{ type: string; input: { events: Pinned[] } }> | undefined;
  return new Map((actions?.[0]?.input.events ?? []).map((e) => [e.id, e.valuation]));
};

beforeEach(() => {
  execute.mockClear();
  get.mockReset();
  get.mockResolvedValue(walletDoc());
});

describe("pin-prices", () => {
  it("prices history from DefiLlama in the portfolio currency, one source label", async () => {
    const result = (await run({ fetchImpl: apis() })) as { priced: number; unpriced: number; retry: number };
    const pins = pinned();
    // 1520.85 USD × 0.82967 EUR/USD
    expect(pins.get("e1")).toMatchObject({ source: "DEFILLAMA", granularity: "DAY", unit: "EUR" });
    expect(Number(pins.get("e1")?.price)).toBeCloseTo(1520.85 * 0.82967, 6);
    expect(pins.get("e2")?.price).toBe(pins.get("e1")?.price);
    expect(result).toMatchObject({ priced: 3, unpriced: 1, retry: 0 });
  });

  it("re-prices a row the broken CoinGecko path pinned UNPRICED", async () => {
    await run({ fetchImpl: apis() });
    expect(pinned().get("e3")).toMatchObject({ source: "DEFILLAMA" });
    expect(Number(pinned().get("e3")?.price)).toBeCloseTo(1.003 * 0.82967, 6);
  });

  it("pins UNPRICED only for a definitive miss, and never touches a manual price", async () => {
    await run({ fetchImpl: apis() });
    expect(pinned().get("e5")).toMatchObject({ price: "0", source: "UNPRICED" });
    expect(pinned().has("e4")).toBe(false);
  });

  it("pins nothing for a coin whose request failed: the next run retries it", async () => {
    const fetchImpl = apis({ llama: () => json({ message: "Too Many Requests" }, 429) });
    const result = (await run({ fetchImpl })) as { priced: number; unpriced: number; retry: number };
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ priced: 0, unpriced: 0, retry: 4 });
  });

  it("prices nothing without exchange rates", async () => {
    const result = (await run({ fetchImpl: apis({ fx: () => json({}, 502) }) })) as { error?: string };
    expect(execute).not.toHaveBeenCalled();
    expect(result.error).toMatch(/exchange rates/);
  });

  it("leaves a fresh UNPRICED pin alone until it is a week old", async () => {
    const fresh = { ...stuck, pinnedAt: "2026-11-15T00:00:00.000Z" };
    get.mockResolvedValue(walletDoc([event("e9", USDT, "2021-03-01T09:00:00.000Z", fresh)]));
    const result = (await run({ fetchImpl: apis(), now: "2026-11-20T00:00:00.000Z" })) as { priced: number };
    expect(execute).not.toHaveBeenCalled();
    expect(result.priced).toBe(0);
  });

  it("prices a day the contract has no history for from its canonical coin", async () => {
    const POLYGON_DAI = "eip155:137/erc20:0x8f3cf7ad23cd3cadbd9735aff958023239c6a063";
    const POL = "eip155:137/slip44:60";
    get.mockResolvedValue(
      walletDoc([
        event("p1", POLYGON_DAI, "2021-03-01T10:00:00.000Z", null),
        event("p2", POL, "2021-03-01T11:00:00.000Z", null),
      ]),
    );
    const asked: string[][] = [];
    const fetchImpl = apis({
      llama: (coins) => {
        asked.push(Object.keys(coins).sort());
        // The contract and POL keys answer without a price for 2021;
        // the canonical coins have one.
        return json({
          coins: {
            "coingecko:dai": { prices: [{ timestamp: noonOf("2021-03-01"), price: 1.001, confidence: 0.99 }] },
            "coingecko:matic-network": { prices: [{ timestamp: noonOf("2021-03-01"), price: 0.4, confidence: 0.99 }] },
          },
        });
      },
    });
    const result = (await run({ fetchImpl })) as { priced: number; unpriced: number };
    expect(asked).toEqual([
      ["coingecko:polygon-ecosystem-token", "polygon:0x8f3cf7ad23cd3cadbd9735aff958023239c6a063"],
      ["coingecko:dai", "coingecko:matic-network"],
    ]);
    expect(Number(pinned().get("p1")?.price)).toBeCloseTo(1.001 * 0.82967, 6);
    expect(Number(pinned().get("p2")?.price)).toBeCloseTo(0.4 * 0.82967, 6);
    expect(pinned().get("p2")).toMatchObject({ source: "DEFILLAMA" });
    expect(result).toMatchObject({ priced: 2, unpriced: 0 });
  });

  it("retries next run when the canonical coin's request fails", async () => {
    const POL = "eip155:137/slip44:60";
    get.mockResolvedValue(walletDoc([event("p2", POL, "2021-03-01T11:00:00.000Z", null)]));
    let call = 0;
    const fetchImpl = apis({
      llama: () => (call++ === 0 ? json({ coins: {} }) : json({ message: "Too Many Requests" }, 429)),
    });
    const result = (await run({ fetchImpl })) as { priced: number; retry: number };
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ priced: 0, retry: 1 });
  });

  it("caps a run at max rows, never-valued rows first, oldest first", async () => {
    await run({ fetchImpl: apis(), max: 2 });
    expect([...pinned().keys()]).toEqual(["e1", "e5"]);
  });
});
