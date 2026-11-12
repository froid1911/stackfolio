import { describe, expect, it } from "vitest";

import { getLogs, getTransactionReceipt } from "./etherscan.js";
import { manifestForChain } from "./manifest.js";
import { SEED_MANIFESTS } from "./manifests/index.js";
import {
  contractChunks,
  fetchDecodedRows,
  mergeDecoded,
} from "./decoded-import.js";

const index = manifestForChain(SEED_MANIFESTS, 1);

const clientReturning =
  (handler: (params: Record<string, string | number>) => unknown) =>
    ({
      async call(params: Record<string, string | number>) {
        return handler(params);
      },
    });

describe("getLogs", () => {
  it("chunks addresses to 20 per call and decodes the log shape", async () => {
    const seen: string[] = [];
    const client = clientReturning((params) => {
      if (params.action !== "getLogs") return [];
      seen.push(String(params.address));
      return seen.length === 1
        ? [
            {
              address: "0xPool",
              topics: ["0xt0", "0xt1"],
              data: "0x01",
              logIndex: "0x0a",
              transactionHash: "0xdead",
            },
          ]
        : [];
    });
    const addresses = Array.from(
      { length: 45 },
      (_, i) => `0x${i.toString(16).padStart(40, "0")}`,
    );
    const { logs, truncated } = await getLogs(client, {
      addresses,
      startBlock: 100,
      endBlock: 200,
    });
    expect(seen).toHaveLength(3);
    expect(seen[0].split(",")).toHaveLength(20);
    expect(seen[2].split(",")).toHaveLength(5);
    expect(truncated).toBe(false);
    expect(logs).toEqual([
      {
        address: "0xPool",
        topics: ["0xt0", "0xt1"],
        data: "0x01",
        logIndex: 10,
        transactionHash: "0xdead",
      },
    ]);
  });

  it("reports truncation once the page ceiling is hit", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({
      address: "0xtok",
      topics: ["0xt"],
      data: "0x",
      logIndex: String(i),
      transactionHash: `0x${i}`,
    }));
    const client = clientReturning(() => full);
    const { truncated } = await getLogs(client, {
      addresses: ["0xtok"],
      startBlock: 0,
      endBlock: 1,
    });
    expect(truncated).toBe(true);
  });
});

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
  it("fetches receipts only for hit hashes and stamps timestamps from blocks", async () => {
    const calls: string[] = [];
    const client = clientReturning((params) => {
      const action = String(params.action);
      calls.push(action);
      if (action === "getLogs") {
        return [
          {
            address: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
            topics: ["0xb3d08482"],
            data: "0x",
            logIndex: "0x5",
            transactionHash: "0xhit",
          },
        ];
      }
      if (action === "eth_getTransactionReceipt") {
        return {
          transactionHash: "0xhit",
          to: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
          blockNumber: "0x64",
          logs: [],
        };
      }
      if (action === "eth_getBlockByNumber") {
        return { timestamp: "0x65f00000" };
      }
      if (action === "eth_getTransactionByHash") {
        return { value: "0x0", to: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2" };
      }
      return [];
    });
    const out = await fetchDecodedRows(client, {
      index,
      chainId: 1,
      account: "0x1AD3d72e54Fb0eB46e87F82f77B284FC8a66b16C",
      startBlock: 0,
      endBlock: 1000,
    });
    expect(calls.filter((c) => c === "eth_getTransactionReceipt")).toHaveLength(1);
    expect(calls).toContain("eth_getBlockByNumber");
    expect(out.inert).toBe(0);
  });

  it("defers hits beyond the receipt budget as overflow", async () => {
    const hits = Array.from({ length: 25 }, (_, i) => ({
      address: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
      topics: ["0xb3d08482"],
      data: "0x",
      logIndex: String(i),
      transactionHash: `0xhit${i}`,
    }));
    const client = clientReturning((params) => {
      if (params.action === "getLogs") return hits;
      if (params.action === "eth_getTransactionReceipt")
        return { transactionHash: params.txhash, to: null, logs: [] };
      return [];
    });
    const out = await fetchDecodedRows(client, {
      index,
      chainId: 1,
      account: "0x1",
      startBlock: 0,
      endBlock: 10,
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
      startBlock: 0,
      endBlock: 10,
    });
    expect(out).toMatchObject({ rows: [], decodedTxHashes: [], overflow: false });
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
    expect(mergeDecoded(generic, { rows: [], decodedTxHashes: [] })).toEqual(generic);
  });
});

describe("log address chunks", () => {
  it("splits contract sets into logscan-sized calls", () => {
    const chunks = contractChunks(["0xa", "0xb", "0xc"]);
    expect(chunks).toEqual([["0xa", "0xb", "0xc"]]);
  });
});
