import { describe, expect, it } from "vitest";
import {
  EtherscanError,
  createEtherscanClient,
  type EtherscanRow,
} from "./etherscan.js";

const KEY = "test-key-123";

type Scripted = Array<{
  status: number;
  body: unknown;
}>;

function fakeFetch(script: Scripted, calls: string[] = []) {
  let n = 0;
  const impl = async (url: string | URL | Request) => {
    const step = script[Math.min(n, script.length - 1)];
    n += 1;
    calls.push(String(url));
    return new Response(
      typeof step.body === "string" ? step.body : JSON.stringify(step.body),
      {
        status: step.status,
        headers: { "content-type": "application/json" },
      },
    );
  };
  return { impl, calls };
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
