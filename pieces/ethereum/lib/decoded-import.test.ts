import { describe, expect, it } from "vitest";

import { getTransactionReceipt } from "./etherscan.js";
import { manifestForChain } from "./manifest.js";
import { SEED_MANIFESTS } from "./manifests/index.js";
import { fetchDecodedRows, mergeDecoded } from "./decoded-import.js";

const index = manifestForChain(SEED_MANIFESTS, 1);

const clientReturning =
  (handler: (params: Record<string, string | number>) => unknown) =>
    ({
      async call(params: Record<string, string | number>) {
        return handler(params);
      },
    });

const REGISTRY = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2";

describe("getTransactionReceipt", () => {
  it("narrows the JSON-RPC receipt to what decoding needs", async () => {
    const client = clientReturning(() => ({
      transactionHash: "0xdead",
      to: "0xPool",
      status: "0x1",
      blockNumber: "0x64",
      logs: [
        {
          address: "0xtok",
          topics: ["0xa"],
          data: "0x0b",
          logIndex: "0x2",
        },
      ],
    }));
    const receipt = await getTransactionReceipt(client, "0xdead");
    expect(receipt).toEqual({
      hash: "0xdead",
      to: "0xPool",
      value: "0x0",
      blockNumber: 100,
      logs: [{ address: "0xtok", topics: ["0xa"], data: "0x0b", logIndex: 2 }],
    });
  });
});

describe("fetchDecodedRows", () => {
  it("fetches receipts only for transactions sent to a registry contract", async () => {
    const calls: string[] = [];
    const client = clientReturning((params) => {
      const action = String(params.action);
      calls.push(action);
      if (action === "eth_getTransactionReceipt") {
        return {
          transactionHash: "0xhit",
          to: REGISTRY,
          blockNumber: "0x64",
          logs: [],
        };
      }
      if (action === "eth_getBlockByNumber") {
        return { timestamp: "0x65f00000" };
      }
      if (action === "eth_getTransactionByHash") {
        return { value: "0x0", to: REGISTRY };
      }
      return [];
    });
    const out = await fetchDecodedRows(client, {
      index,
      chainId: 1,
      account: "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C",
      transactions: [
        { hash: "0xmiss", to: "0x1111111111111111111111111111111111111111" },
        { hash: "0xhit", to: REGISTRY },
        { hash: "", to: REGISTRY },
      ],
    });
    expect(
      calls.filter((c) => c === "eth_getTransactionReceipt"),
    ).toHaveLength(1);
    expect(calls).toContain("eth_getBlockByNumber");
    expect(out.inert).toBe(0);
  });

  it("defers candidates beyond the receipt budget as overflow", async () => {
    const transactions = Array.from({ length: 60 }, (_, i) => ({
      hash: `0xhit${i}`,
      to: REGISTRY,
    }));
    const client = clientReturning((params) => {
      if (params.action === "eth_getTransactionReceipt")
        return { transactionHash: params.txhash, to: null, logs: [] };
      if (params.action === "eth_getTransactionByHash") return { value: "0x0" };
      if (params.action === "eth_getBlockByNumber")
        return { timestamp: "0x65f00000" };
      return [];
    });
    const out = await fetchDecodedRows(client, {
      index,
      chainId: 1,
      account: "0x1",
      transactions,
      receiptBudget: 20,
    });
    expect(out.overflow).toBe(true);
  });

  it("survives a failing indexer as no rows, never a throw", async () => {
    const client = {
      async call() {
        throw new Error("indexer on fire");
      },
    } as unknown as Parameters<typeof fetchDecodedRows>[0];
    const out = await fetchDecodedRows(client, {
      index,
      chainId: 1,
      account: "0x1",
      transactions: [{ hash: "0xhit", to: REGISTRY }],
    });
    expect(out).toMatchObject({
      rows: [],
      decodedTxHashes: [],
      overflow: false,
    });
  });
});

describe("mergeDecoded", () => {
  const row = (eventIdentifier: string, type = "RECEIVE") => ({
    eventIdentifier,
    sequenceIndex: 0,
    timestamp: "2026-01-01T00:00:00.000Z",
    type: type as "RECEIVE",
    subtype: "NONE" as const,
    asset: "eip155:1/slip44:60",
    amount: "1",
    counterparty: "0xabc",
    notes: null,
  });

  it("drops generic rows of decoded txs and keeps the rest", () => {
    const merged = mergeDecoded([row("0xaa"), row("0xbb")], {
      rows: [row("0xaa-3", "SPEND")],
      decodedTxHashes: ["0xaa"],
    });
    expect(merged.map((r) => r.eventIdentifier)).toEqual(["0xbb", "0xaa-3"]);
  });

  it("is a no-op for an empty decode", () => {
    const generic = [row("0xaa")];
    expect(
      mergeDecoded(generic, { rows: [], decodedTxHashes: [] }),
    ).toEqual(generic);
  });
});
