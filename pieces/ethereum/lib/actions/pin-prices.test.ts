import { beforeEach, describe, expect, it, vi } from "vitest";

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

const USDS = "eip155:1/erc20:0xdc035d45d973e3ec169d2276ddab16f1e407384f";

const ledger = [
  event("e1", "eip155:1/slip44:60", "2026-11-01T10:00:00.000Z", null),
  event("e2", "eip155:1/slip44:60", "2026-11-01T11:00:00.000Z", null),
  event("e3", "eip155:1/slip44:60", "2026-11-02T10:00:00.000Z", null),
  event(
    "e4",
    "eip155:1/slip44:60",
    "2026-11-03T10:00:00.000Z",
    { unit: "EUR", price: "1", source: "MANUAL", granularity: "NONE", pinnedAt: "x" },
  ),
  event("e5", USDS, "2026-11-01T12:00:00.000Z", null),
  event("e6", "eip155:1/erc20:0x1111111111111111111111111111111111111111", "2026-11-01T13:00:00.000Z", null),
];

const walletDoc = {
  header: { documentType: "stackfolio/wallet-account" },
  state: { global: { address: "0xabc", chainId: 1, ledger } },
};

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

const execute = vi.fn().mockResolvedValue({});
const get = vi.fn();

const run = (props: Record<string, unknown>) =>
  ethereumPinPricesAction.run({
    propsValue: props,
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<typeof ethereumPinPricesAction.run>[0]);

beforeEach(() => {
  execute.mockClear();
  get.mockReset();
  get.mockResolvedValue(walletDoc);
});

describe("pin-prices", () => {
  it("pins one daily close per asset-day and UNPRICED for misses", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/coins/ethereum/history")) return jsonResponse({ eur: 3000 });
      if (url.includes("/coins/ethereum/contract/0xdc035d45d973e3ec169d2276ddab16f1e407384f"))
        return jsonResponse([{ id: "susds" }]);
      if (url.includes("/coins/susds/history")) return jsonResponse({ eur: 1.02 });
      if (url.includes("/contract/0x1111111111111111111111111111111111111111"))
        return jsonResponse([]);
      throw new Error(`unexpected url ${url}`);
    });
    const result = (await run({
      documentId: "w1",
      max: 50,
      fetchImpl,
    })) as { priced: number; unpriced: number };

    expect(result.priced).toBe(4);
    expect(result.unpriced).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    const actions = execute.mock.calls[0][2] as Array<{
      type: string;
      input: {
        events: Array<{
          id: string;
          valuation: { price: string; source: string; granularity: string };
        }>;
      };
    }>;
    expect(actions[0].type).toBe("PIN_VALUATIONS");
    const pins = new Map(
      actions[0].input.events.map((e) => [e.id, e.valuation]),
    );
    expect(pins.get("e1")).toMatchObject({ price: "3000", source: "COINGECKO" });
    expect(pins.get("e2")).toMatchObject({ price: "3000", source: "COINGECKO" });
    expect(pins.get("e3")).toMatchObject({ price: "3000", source: "COINGECKO" });
    expect(pins.get("e5")).toMatchObject({ price: "1.02", source: "COINGECKO" });
    expect(pins.get("e6")).toMatchObject({ price: "0", source: "UNPRICED" });
    expect(pins.has("e4")).toBe(false);
    // One history call per (asset, day): ethereum on 2 days + susds on 1.
    const historyCalls = fetchImpl.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes("/history"));
    expect(historyCalls).toHaveLength(3);
    expect(actions[0].input.events.every((e) => e.valuation.granularity === "DAY")).toBe(true);
  });

  it("caps the batch at max rows, oldest first", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/history")) return jsonResponse({ eur: 3000 });
      return jsonResponse([]);
    });
    const result = (await run({
      documentId: "w1",
      max: 2,
      fetchImpl,
    })) as { priced: number; unpriced: number };
    const dispatched = execute.mock.calls[0]?.[2] as
      | Array<{ input: { events: Array<{ id: string }> } }>
      | undefined;
    const events = dispatched?.[0]?.input.events ?? [];
    expect(events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(result.priced + result.unpriced).toBe(2);
  });

  it("does nothing when every row already carries a valuation", async () => {
    get.mockResolvedValue({
      header: { documentType: "stackfolio/wallet-account" },
      state: {
        global: {
          address: "0xabc",
          chainId: 1,
          ledger: [
            event("e1", "eip155:1/slip44:60", "2026-11-01T10:00:00.000Z", {
              unit: "EUR",
              price: "1",
              source: "MANUAL",
              granularity: "NONE",
              pinnedAt: "x",
            }),
          ],
        },
      },
    });
    const result = (await run({
      documentId: "w1",
      max: 50,
      fetchImpl: vi.fn(),
    })) as { priced: number; unpriced: number };
    expect(result).toEqual({ priced: 0, unpriced: 0 });
    expect(execute).not.toHaveBeenCalled();
  });
});
