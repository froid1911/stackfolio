import { describe, expect, it } from "vitest";
import {
  BlockscoutError,
  createBlockscoutClient,
} from "./blockscout.js";

const KEY = "proapi-test-key";

function scripted(responses: Array<{ status: number; body: unknown }>) {
  let n = 0;
  const urls: string[] = [];
  const impl = (async (input: unknown) => {
    urls.push(String(input));
    const step = responses[Math.min(n, responses.length - 1)];
    n += 1;
    return new Response(JSON.stringify(step.body), {
      status: step.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, urls };
}

const noSleep = async () => {};

const client = (impl: typeof fetch) =>
  createBlockscoutClient({
    apiKey: KEY,
    chainId: 10,
    fetchImpl: impl,
    sleepFn: noSleep,
  });

describe("createBlockscoutClient", () => {
  it("walks cursor pages back to older", async () => {
    const { impl, urls } = scripted([
      {
        status: 200,
        body: {
          items: [{ hash: "0xa" }],
          next_page_params: { index: 5, value: "1", hash: "0xa" },
        },
      },
      { status: 200, body: { items: [{ hash: "0xb" }], next_page_params: null } },
    ]);
    const c = client(impl);
    const first = await c.getPage("/addresses/0x1/transactions");
    expect(first.items).toHaveLength(1);
    const second = await c.getPage("/addresses/0x1/transactions", first.nextPageParams);
    expect(second.items).toHaveLength(1);
    expect(second.nextPageParams).toBeNull();
    expect(urls[1]).toContain("index=5");
    expect(urls[0]).toContain("apikey=");
    expect(urls[0]).toContain("/10/api/v2/");
  });

  it("retries a Too Many Requests body as transient", async () => {
    const { impl } = scripted([
      { status: 200, body: { error: "Too Many Requests", source: "internal" } },
      { status: 200, body: { items: [], next_page_params: null } },
    ]);
    const page = await client(impl).getPage("/addresses/0x1/transactions");
    expect(page.items).toEqual([]);
  });

  it("fails fast on an unsupported network", async () => {
    const { impl } = scripted([
      { status: 200, body: { error: "Network not supported", source: "internal" } },
    ]);
    const err = await client(impl)
      .getPage("/addresses/0x1/transactions")
      .catch((e: unknown) => e as BlockscoutError);
    expect(err).toBeInstanceOf(BlockscoutError);
    expect((err as BlockscoutError).category).toBe("unavailable");
  });

  it("categorizes a rejected key as auth", async () => {
    const { impl } = scripted([{ status: 403, body: {} }]);
    const err = await client(impl)
      .getPage("/addresses/0x1/transactions")
      .catch((e: unknown) => e as BlockscoutError);
    expect((err as BlockscoutError).category).toBe("auth");
    expect(String((err as BlockscoutError).message)).not.toContain(KEY);
  });

  it("categorizes a plan-gated chain as unavailable", async () => {
    const { impl } = scripted([
      {
        status: 200,
        body: {
          error: "Featured chain 8453 requires one of the following plans",
          source: "internal",
        },
      },
    ]);
    const err = await client(impl)
      .getPage("/addresses/0x1/transactions")
      .catch((e: unknown) => e as BlockscoutError);
    expect((err as BlockscoutError).category).toBe("unavailable");
  });
});
