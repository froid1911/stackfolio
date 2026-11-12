import { describe, expect, it, vi } from "vitest";

import {
  HyperliquidError,
  createHyperliquidClient,
  fetchHlSnapshot,
  hyperliquidConfig,
  isHlAddress,
} from "./hyperliquid.js";

const sleep = async () => {};

/** Answer by request `type`; every answer is HTTP 200 JSON. */
function responder(routes: Record<string, unknown>) {
  const calls: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(
    async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push(body);
      const answer = routes[String(body.type)];
      return { status: 200, json: async () => answer };
    },
  );
  return { fetchImpl, calls };
}

describe("hyperliquidConfig", () => {
  it("defaults to the public API and honours the override", () => {
    expect(hyperliquidConfig({}).baseUrl).toBe("https://api.hyperliquid.xyz");
    expect(hyperliquidConfig({ hyperliquidUrl: " http://hl.local/ " }).baseUrl).toBe(
      "http://hl.local/",
    );
  });
});

describe("isHlAddress", () => {
  it("accepts EVM addresses only", () => {
    expect(isHlAddress("0x8a88728340b81741c8ad70b07f601d99e9c3f7cb")).toBe(true);
    expect(isHlAddress("0x8A88728340B81741C8AD70B07F601D99E9C3F7CB")).toBe(true);
    expect(isHlAddress("frankp.eth")).toBe(false);
    expect(isHlAddress("0x123")).toBe(false);
  });
});

describe("createHyperliquidClient", () => {
  it("posts the body to /info", async () => {
    const { fetchImpl, calls } = responder({ clearinghouseState: {} });
    const client = createHyperliquidClient({
      baseUrl: "http://hl.test",
      fetchImpl: fetchImpl,
      sleepFn: sleep,
    });
    await client.info({ type: "clearinghouseState", user: "0xa" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://hl.test/info",
      expect.objectContaining({ method: "POST" }),
    );
    expect(calls[0]).toEqual({ type: "clearinghouseState", user: "0xa" });
  });

  it("retries transient pressure and succeeds", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return { status: 429, json: async () => ({}) };
      return { status: 200, json: async () => ({ ok: true }) };
    });
    const client = createHyperliquidClient({
      fetchImpl: fetchImpl,
      sleepFn: sleep,
      spacingMs: 0,
    });
    await expect(client.info({ type: "x" })).resolves.toEqual({ ok: true });
    expect(attempt).toBe(2);
  });

  it("fails fast on a rejected request, naming the API's reason", async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 422,
      json: async () => ({ message: "Unrecognized input type" }),
    }));
    const client = createHyperliquidClient({
      fetchImpl: fetchImpl,
      sleepFn: sleep,
      spacingMs: 0,
    });
    const error = await client
      .info({ type: "nope" })
      .then(() => null)
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(HyperliquidError);
    expect((error as HyperliquidError).category).toBe("rejected");
    expect((error as Error).message).toContain("Unrecognized input type");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up as transient when the host never answers", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = createHyperliquidClient({
      fetchImpl: fetchImpl,
      sleepFn: sleep,
      spacingMs: 0,
    });
    const error = await client
      .info({ type: "x" })
      .then(() => null)
      .catch((cause: unknown) => cause);
    expect((error as HyperliquidError).category).toBe("transient");
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  });
});

const SPOT_META = {
  universe: [
    { name: "USDC", tokenId: 0 },
    { name: "HYPE", tokenId: 150 },
  ],
};

const SPOT_STATE = {
  balances: [
    { token: "0", total: "100.5", hold: "1", entryNtl: "100" },
    { token: "150", total: "2.5", hold: "0", entryNtl: "45" },
    { token: "7", total: "0", hold: "0", entryNtl: "0" },
    { token: "999", total: "3", hold: "0", entryNtl: "3" },
  ],
};

const PERP_STATE = {
  marginSummary: { accountValue: "1234.56", totalNtlPos: "100", totalRawUsd: "1134" },
  assetPositions: [
    {
      position: {
        coin: "HYPE",
        szi: "1.5",
        entryPx: "18.2",
        positionValue: "28.1",
        unrealizedPnl: "0.4",
      },
    },
    {
      position: {
        coin: "BTC",
        szi: "0.0",
        entryPx: "60000",
        positionValue: "0",
        unrealizedPnl: "0",
      },
    },
  ],
};

const FILLS = [
  {
    tid: 900001,
    coin: "HYPE",
    side: "B",
    px: "18.0",
    sz: "2",
    szDiff: "1.5",
    time: 1730000000000,
    dir: "Open Long",
    fee: "0.01",
    closedPnl: "0",
  },
  { tid: 900002, coin: "BTC", side: "A", px: "6", sz: "1", time: 1730000001000 },
  { coin: "junk", side: "B", px: "1", time: 5 }, // no tid -> dropped
];

describe("fetchHlSnapshot", () => {
  it("maps balances, positions and fills, skipping dust and flats", async () => {
    const { fetchImpl, calls } = responder({
      spotMeta: SPOT_META,
      spotClearinghouseState: SPOT_STATE,
      clearinghouseState: PERP_STATE,
      userFills: FILLS,
    });
    const client = createHyperliquidClient({
      fetchImpl: fetchImpl,
      sleepFn: sleep,
      spacingMs: 0,
    });
    const snapshot = await fetchHlSnapshot(
      client,
      "0x8A88728340B81741C8AD70B07F601D99E9C3F7CB",
    );
    expect(snapshot.accountValueUsd).toBe("1234.56");
    expect(snapshot.spot).toEqual([
      { tokenIndex: 0, coin: "USDC", total: "100.5", hold: "1" },
      { tokenIndex: 150, coin: "HYPE", total: "2.5", hold: "0" },
      // Unknown token 999 keeps its numeric name.
      { tokenIndex: 999, coin: "999", total: "3", hold: "0" },
    ]);
    expect(snapshot.perps).toEqual([
      {
        coin: "HYPE",
        szi: "1.5",
        entryPx: "18.2",
        positionValue: "28.1",
        unrealizedPnl: "0.4",
      },
    ]);
    expect(snapshot.fills).toEqual([
      {
        tid: 900001,
        coin: "HYPE",
        side: "B",
        px: "18.0",
        sz: "1.5", // szDiff wins over the order size
        time: 1730000000000,
        dir: "Open Long",
        fee: "0.01",
        closedPnl: "0",
      },
      {
        tid: 900002,
        coin: "BTC",
        side: "A",
        px: "6",
        sz: "1", // falls back to sz
        time: 1730000001000,
        dir: null,
        fee: null,
        closedPnl: null,
      },
    ]);
    // The address went lower-cased to every user-scoped call.
    const users = calls.filter((call) => call.user !== undefined);
    expect(users).toHaveLength(3);
    for (const call of users) {
      expect(call.user).toBe("0x8a88728340b81741c8ad70b07f601d99e9c3f7cb");
    }
  });

  it("survives an account with no data at all", async () => {
    const { fetchImpl } = responder({
      spotMeta: {},
      spotClearinghouseState: {},
      clearinghouseState: {},
      userFills: null,
    });
    const client = createHyperliquidClient({
      fetchImpl: fetchImpl,
      sleepFn: sleep,
      spacingMs: 0,
    });
    const snapshot = await fetchHlSnapshot(
      client,
      "0x0000000000000000000000000000000000000001",
    );
    expect(snapshot).toEqual({
      accountValueUsd: null,
      spot: [],
      perps: [],
      fills: [],
    });
  });
});
