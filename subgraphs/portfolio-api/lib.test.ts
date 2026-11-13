import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionResult } from "viem";
import { attachGaps, attachValuations, forwardEnsAddress, newestPrices } from "./lib.js";

const RESOLVER = "0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41";
const ADDRESS = "5c647ca5e2bc5bd17c40410fcb8003d38879ae50";

const addrAbiResult = [
  {
    inputs: [
      { internalType: "bytes32", name: "node", type: "bytes32" },
      { internalType: "uint256", name: "coinType", type: "uint256" },
    ],
    name: "addr",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const registryAbiResult = [
  {
    inputs: [{ internalType: "bytes32", name: "node", type: "bytes32" }],
    name: "resolver",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** Serve a scripted eth_call chain; records every call it answers. */
function stubNode(replies: (string | null)[]) {
  const seen: { to: string; data: string }[] = [];
  let next = 0;
  vi.stubGlobal(
    "fetch",
    async (_url: unknown, init: { body: string }) => {
      const request = JSON.parse(String(init.body)) as {
        id: number;
        params: [{ to: string; data: string }];
      };
      seen.push(request.params[0]);
      const reply = replies[next++];
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          ...(reply === null
            ? { error: { code: 3, message: "execution reverted" } }
            : { result: reply }),
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  );
  return seen;
}

const addrReply = (bytes: string) =>
  encodeFunctionResult({
    abi: addrAbiResult,
    functionName: "addr",
    result: bytes as `0x${string}`,
  });

describe("forwardEnsAddress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the address a plain resolver returns", async () => {
    const seen = stubNode([
      encodeFunctionResult({
        abi: registryAbiResult,
        functionName: "resolver",
        result: RESOLVER,
      }),
      addrReply(`0x${ADDRESS}`),
    ]);
    const address = await forwardEnsAddress("http://127.0.0.1:8545", "frankp.eth");
    expect(address).toBe(`0x${ADDRESS}`);
    // Registry first, then the resolver it named - no universal resolver.
    expect(seen[0].to).toBe("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e");
    // viem writes the checksummed form back into the call.
    expect(seen[1].to.toLowerCase()).toBe(RESOLVER);
  });

  it("takes the last 20 bytes of a 32-byte word", async () => {
    stubNode([
      encodeFunctionResult({
        abi: registryAbiResult,
        functionName: "resolver",
        result: RESOLVER,
      }),
      addrReply(`0x000000000000000000000000${ADDRESS}`),
    ]);
    expect(await forwardEnsAddress("http://127.0.0.1:8545", "frankp.eth")).toBe(
      `0x${ADDRESS}`,
    );
  });

  it("answers null when the name has no resolver", async () => {
    stubNode([
      encodeFunctionResult({
        abi: registryAbiResult,
        functionName: "resolver",
        result: "0x0000000000000000000000000000000000000000",
      }),
    ]);
    expect(await forwardEnsAddress("http://127.0.0.1:8545", "gone.eth")).toBeNull();
  });

  it("refuses a non-http rpc url before touching the network", async () => {
    stubNode([]);
    await expect(
      forwardEnsAddress("file:///etc/passwd", "evil.eth"),
    ).rejects.toThrow("http(s)");
  });
});

describe("newestPrices", () => {
  it("keeps the newest answer per asset, whatever the row order", () => {
    const rows = [
      { asset: "ETH", price: "1754.28", fetchedAt: "2026-11-13T15:51:42.847Z" },
      { asset: "ETH", price: "3100.5", fetchedAt: "2026-11-11T12:00:31Z" },
      { asset: "UNI", price: "8.42", fetchedAt: "2026-11-11T12:00:31Z" },
      { asset: "UNI", price: "5.28", fetchedAt: "2026-11-13T15:51:42.847Z" },
    ];
    for (const order of [rows, [...rows].reverse()]) {
      expect(newestPrices(order)).toEqual([
        { asset: "ETH", price: "1754.28", fetchedAt: "2026-11-13T15:51:42.847Z" },
        { asset: "UNI", price: "5.28", fetchedAt: "2026-11-13T15:51:42.847Z" },
      ]);
    }
  });

  it("compares instants, not strings, across timestamp spellings", () => {
    expect(
      newestPrices([
        { asset: "ETH", price: "2", fetchedAt: "2026-11-13T10:00:00Z" },
        { asset: "ETH", price: "1", fetchedAt: "2026-11-13T09:59:59.999Z" },
      ]).map((p) => p.price),
    ).toEqual(["2"]);
  });
});

describe("attachValuations", () => {
  it("hands each event leg its own price, null where the books have none", () => {
    const rows = [
      { eventId: "a", sequenceIndex: 0, amount: "1" },
      { eventId: "a", sequenceIndex: 1, amount: "2" },
      { eventId: "b", sequenceIndex: 0, amount: "3" },
    ];
    const valuations = [
      { eventId: "a", sequenceIndex: 1, price: "2000", priceUnit: "EUR", priceSource: "COINGECKO" },
      { eventId: "b", sequenceIndex: 0, price: null, priceUnit: null, priceSource: "UNPRICED" },
    ];
    expect(attachValuations(rows, valuations)).toEqual([
      { eventId: "a", sequenceIndex: 0, amount: "1", price: null, priceUnit: null, priceSource: null },
      { eventId: "a", sequenceIndex: 1, amount: "2", price: "2000", priceUnit: "EUR", priceSource: "COINGECKO" },
      // An UNPRICED marker is no price at all.
      { eventId: "b", sequenceIndex: 0, amount: "3", price: null, priceUnit: null, priceSource: null },
    ]);
  });
});

describe("attachGaps", () => {
  it("names the gap per leg, value over basis", () => {
    const rows = [
      { eventId: "a", sequenceIndex: 0 },
      { eventId: "b", sequenceIndex: 0 },
      { eventId: "c", sequenceIndex: 0 },
    ];
    const gaps = [
      { eventId: "a", sequenceIndex: 0, reason: "basis" },
      { eventId: "a", sequenceIndex: 0, reason: "value" },
      { eventId: "b", sequenceIndex: 0, reason: "basis" },
    ];
    expect(attachGaps(rows, gaps).map((r) => r.priceGap)).toEqual(["value", "basis", null]);
  });
});
