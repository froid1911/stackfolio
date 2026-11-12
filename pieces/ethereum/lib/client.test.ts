import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientBundle } from "./client.js";

/**
 * These tests exist because mocked bundles hid a real defect: viem's
 * getLogs serialised a plain topics array as `topics: []`, so the node
 * was asked for every log in the range. The assertions here are about
 * the JSON-RPC body on the wire, not about any viem behaviour.
 */
const captured: string[] = [];

beforeEach(() => {
  captured.length = 0;
  vi.stubGlobal(
    "fetch",
    async (_url: unknown, init: { body?: BodyInit | null }) => {
      const body = typeof init?.body === "string" ? init.body : "";
      captured.push(body);
      const { id } = JSON.parse(body) as { id?: number };
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: id ?? 1, result: [] }),
        { headers: { "content-type": "application/json" } },
      );
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createClientBundle wire format", () => {
  it("sends topics and block bounds exactly as asked", async () => {
    const bundle = createClientBundle({ rpcUrl: "http://127.0.0.1:8545" });
    await bundle.getLogs({
      fromBlock: 0x192b2f2n,
      toBlock: 0x192b4e5n,
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        null,
        "0x0000000000000000000000005c647ca5e2bc5bd17c40410fcb8003d38879ae50",
      ],
    });
    expect(captured).toHaveLength(1);
    const parsed = JSON.parse(captured[0]) as {
      method: string;
      params: Array<Record<string, unknown>>;
    };
    expect(parsed.method).toBe("eth_getLogs");
    const filter = parsed.params[0];
    expect(filter.fromBlock).toBe("0x192b2f2");
    expect(filter.toBlock).toBe("0x192b4e5");
    // Null topics keep their position ("any topic here"); dropping them
    // would shift the later ones to the wrong index.
    expect(filter.topics).toEqual([
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      null,
      "0x0000000000000000000000005c647ca5e2bc5bd17c40410fcb8003d38879ae50",
    ]);
  });

  it("keeps balances and nonces block-scoped when a block is given", async () => {
    const bundle = createClientBundle({ rpcUrl: "http://127.0.0.1:8545" });
    await bundle.getBalance("0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50", 1_000_000n);
    await bundle.getNonce("0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50", 1_000_000n);
    expect(captured[0]).toContain('"eth_getBalance"');
    expect(captured[0]).toContain('"0xf4240"');
    expect(captured[1]).toContain('"eth_getTransactionCount"');
    expect(captured[1]).toContain('"0xf4240"');
  });
});
