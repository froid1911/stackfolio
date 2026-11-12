import { describe, expect, it } from "vitest";
import {
  fetchWindowCapped,
  EtherscanError,
  createEtherscanClient,
  type EtherscanRow,
} from "./etherscan.js";

const KEY = "test-key-123";

type Scripted = Array<{
  status: number;
  body: unknown;
}>;

function fakeFetch(script: Scripted) {
  let n = 0;
  const impl = (async () => {
    const step = script[Math.min(n, script.length - 1)];
    n += 1;
    return new Response(
      typeof step.body === "string" ? step.body : JSON.stringify(step.body),
      {
        status: step.status,
        headers: { "content-type": "application/json" },
      },
    );
  }) as unknown as typeof fetch;
  return { impl };
}

const noSleep = async () => {};

describe("createEtherscanClient", () => {
  it("unwraps a successful status-1 result", async () => {
    const { impl } = fakeFetch([
      { status: 200, body: { status: "1", result: [{ hash: "0xa" }], message: "OK" } },
    ]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://api.etherscan.io/v2/api?chainid=1",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    const rows = (await client.call({
      module: "account",
      action: "txlist",
      address: "0xabc",
    })) as EtherscanRow[];
    expect(rows[0].hash).toBe("0xa");
  });

  it("sends chainid on every call", async () => {
    const urls: string[] = [];
    const impl = (async (input: unknown) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({ status: "1", result: [], message: "OK" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://api.etherscan.io/v2/api",
      chainId: 8453,
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    await client.call({ module: "account", action: "txlist", address: "0xabc" });
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).searchParams.get("chainid")).toBe("8453");
  });

  it("unwraps a bare JSON-RPC answer from the proxy module", async () => {
    const { impl } = fakeFetch([
      { status: 200, body: { jsonrpc: "2.0", id: 1, result: "0x192bf31" } },
    ]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    const head = await client.call({ module: "proxy", action: "eth_blockNumber" });
    expect(head).toBe("0x192bf31");
  });

  it("retries a JSON-RPC rate-limit error as transient", async () => {
    const { impl } = fakeFetch([
      {
        status: 200,
        body: {
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "Max rate limit reached" },
        },
      },
      { status: 200, body: { jsonrpc: "2.0", id: 1, result: "0x10" } },
    ]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    const head = await client.call({ module: "proxy", action: "eth_blockNumber" });
    expect(head).toBe("0x10");
  });

  it("paces two clients that share one key through a single gate", async () => {
    const events: string[] = [];
    const mk = () =>
      createEtherscanClient({
        apiKey: "gate-test-shared-key",
        baseUrl: "https://x/api",
        fetchImpl: async () => {
          events.push("fetch");
          return new Response(
            JSON.stringify({ status: "1", result: [], message: "OK" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
        sleepFn: async () => {
          events.push("sleep");
        },
      });
    const arb = mk();
    const poly = mk();
    await Promise.all([
      arb.call({ module: "account", action: "txlist", address: "0xa" }),
      poly.call({ module: "account", action: "tokentx", address: "0xb" }),
    ]);
    expect(events).toEqual(["sleep", "fetch", "sleep", "fetch"]);
  });

  it("treats a status-0 empty page as no data, not an error", async () => {
    const { impl } = fakeFetch([
      {
        status: 200,
        body: { status: "0", result: [], message: "No transactions found" },
      },
    ]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    const rows = await client.call({
      module: "account",
      action: "txlist",
      address: "0xabc",
    });
    expect(rows).toEqual([]);
  });

  it("categorizes an invalid key as auth and never echoes the key", async () => {
    const { impl } = fakeFetch([
      { status: 200, body: { status: "0", result: "", message: "Invalid API Key" } },
    ]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    const err = await client
      .call({ module: "account", action: "txlist", address: "0xabc" })
      .catch((e: unknown) => e as EtherscanError);
    expect(err).toBeInstanceOf(EtherscanError);
    expect((err as EtherscanError).category).toBe("auth");
    expect((err as Error).message).not.toContain(KEY);
  });

  it("categorizes plan-gated NOTOK as unavailable", async () => {
    const { impl } = fakeFetch([
      {
        status: 200,
        body: {
          status: "0",
          result: "",
          message: "not available for your plan",
        },
      },
    ]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    const err = (await client
      .call({ module: "account", action: "tokenApprovals", address: "0xabc" })
      .catch((e: unknown) => e)) as EtherscanError;
    expect(err.category).toBe("unavailable");
  });

  it("retries 429 then succeeds", async () => {
    const { impl } = fakeFetch([
      { status: 429, body: "slow" },
      { status: 200, body: { status: "1", result: "0x190", message: "OK" } },
    ]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    await expect(
      client.call({ module: "proxy", action: "eth_blockNumber" }),
    ).resolves.toBe("0x190");
  });

  it("fails as transient after exhausting retries, without the key", async () => {
    const { impl } = fakeFetch([{ status: 429, body: "slow" }]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    const err = (await client
      .call({ module: "proxy", action: "eth_blockNumber" })
      .catch((e: unknown) => e)) as EtherscanError;
    expect(err).toBeInstanceOf(EtherscanError);
    expect(err.category).toBe("transient");
    expect(err.message).not.toContain(KEY);
  });

  it("treats a status-0 rate-limit answer as transient pressure and retries", async () => {
    const { impl } = fakeFetch([
      { status: 200, body: { status: "0", result: "Rate limit reach", message: "NOTOK" } },
      { status: 200, body: { status: "1", result: [], message: "OK" } },
    ]);
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    await expect(
      client.call({ module: "account", action: "txlist", address: "0xabc" }),
    ).resolves.toEqual([]);
  });

  it("serializes calls: the second starts only after the first resolves", async () => {
    const order: string[] = [];
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let n = 0;
    const impl = (async () => {
      n += 1;
      order.push(`start${n}`);
      if (n === 1) {
        started.resolve();
        await release.promise;
      }
      order.push(`end${n}`);
      return new Response(
        JSON.stringify({ status: "1", result: "0x1", message: "OK" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const client = createEtherscanClient({
      apiKey: KEY,
      baseUrl: "https://x/api",
      fetchImpl: impl,
      sleepFn: noSleep,
    });
    const p1 = client.call({ module: "proxy", action: "eth_blockNumber" });
    await started.promise;
    const p2 = client.call({ module: "proxy", action: "eth_blockNumber" });
    release.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(["start1", "end1", "start2", "end2"]);
  });
});

describe("fetchWindowCapped", () => {
  const full = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ hash: `0x${i}` }));
  it("stops at the page ceiling and says so", async () => {
    const calls: number[] = [];
    const client = {
      async call(params: Record<string, string | number>) {
        calls.push(Number(params.page));
        return full(2); // every page full
      },
    };
    const out = await fetchWindowCapped(client, {
      address: "0xabc",
      action: "txlist",
      startBlock: 0,
      endBlock: 99,
      pageSize: 2,
      maxPages: 3,
    });
    expect(out.rows).toHaveLength(6);
    expect(out.truncated).toBe(true);
    expect(calls).toEqual([1, 2, 3]);
  });
  it("is not truncated when a short page ends the window", async () => {
    const client = {
      async call(params: Record<string, string | number>) {
        return Number(params.page) === 1 ? full(2) : full(1);
      },
    };
    const out = await fetchWindowCapped(client, {
      address: "0xabc",
      action: "txlist",
      startBlock: 0,
      endBlock: 99,
      pageSize: 2,
      maxPages: 3,
    });
    expect(out.truncated).toBe(false);
    expect(out.rows).toHaveLength(3);
  });
});