import { describe, expect, it } from "vitest";
import { fetchAnkrHistory } from "./fetch-ankr-history.js";
import { fetchAnkrRecent } from "./fetch-ankr-recent.js";
import type { AnkrClient, AnkrTx, AnkrTxPage } from "../ankr.js";

const SELF = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";

function tx(hash: string, blockNumber: number, over: Partial<AnkrTx> = {}): AnkrTx {
  return {
    hash,
    from: SELF,
    to: "0x0000000000000000000000000000000000000002",
    value: "0xa",
    blockNumber: `0x${blockNumber.toString(16)}`,
    timestamp: "0x67000000",
    gasUsed: "0x0",
    gasPrice: "0x1",
    status: "0x1",
    ...over,
  };
}

class FakeAnkr {
  calls: Record<string, unknown>[] = [];
  constructor(
    private pages: Record<string, { txs: AnkrTx[]; nextPageToken: string | null }[]>,
  ) {}

  client(): AnkrClient {
    return {
      transactions: async (opts) => {
        this.calls.push({ kind: "transactions", ...opts });
        const key = `${opts.fromBlock}-${opts.toBlock}`;
        const seq = this.pages[key] ?? [];
        const index = opts.pageToken === null || opts.pageToken === undefined
          ? 0
          : Number(opts.pageToken) + 1;
        const page = seq[index] ?? { txs: [], nextPageToken: null };
        return {
          txs: page.txs,
          nextPageToken: page.nextPageToken,
          headBlock: null,
        } satisfies AnkrTxPage;
      },
      rpc: async (_chain, method) => {
        this.calls.push({ kind: "rpc", method });
        return method === "eth_getBalance" ? "0x64" : "0x64";
      },
    };
  }
}

describe("fetchAnkrHistory", () => {
  it("walks windows ascending and finishes at the safe head", async () => {
    const fake = new FakeAnkr({
      "0-99": [{ txs: [tx("0xa1", 10)], nextPageToken: null }],
      "100-199": [{ txs: [tx("0xa2", 150)], nextPageToken: null }],
    });
    const out = await fetchAnkrHistory(fake.client(), {
      chain: "base",
      chainId: 8453,
      address: SELF,
      startBlock: 0,
      safeHead: 199,
      windowBlocks: 100,
      budgetMs: 10_000,
      maxRows: 0,
      now: () => 0,
    });
    expect(out.done).toBe(true);
    expect(out.nextBlock).toBe(200);
    expect(out.rows.map((r) => r.eventIdentifier)).toEqual(["0xa1", "0xa2"]);
    expect(out.skippedCategories).toEqual(["internal"]);
  });

  it("pages through the opaque token inside a window", async () => {
    const fake = new FakeAnkr({
      "0-99": [
        { txs: [tx("0xb1", 10)], nextPageToken: "0" },
        { txs: [tx("0xb2", 20)], nextPageToken: null },
      ],
    });
    const out = await fetchAnkrHistory(fake.client(), {
      chain: "base",
      chainId: 8453,
      address: SELF,
      startBlock: 0,
      safeHead: 99,
      windowBlocks: 100,
      budgetMs: 10_000,
      maxRows: 0,
      now: () => 0,
    });
    expect(out.done).toBe(true);
    expect(out.rows).toHaveLength(2);
    const tokens = fake.calls.filter((c) => c.kind === "transactions").map((c) => c.pageToken ?? null);
    expect(tokens).toEqual([null, "0"]);
  });

  it("stops at a window boundary when the row cap is hit", async () => {
    const fake = new FakeAnkr({
      "0-99": [{ txs: [tx("0xc1", 10), tx("0xc2", 20)], nextPageToken: null }],
      "100-199": [{ txs: [tx("0xc3", 150)], nextPageToken: null }],
    });
    const out = await fetchAnkrHistory(fake.client(), {
      chain: "base",
      chainId: 8453,
      address: SELF,
      startBlock: 0,
      safeHead: 199,
      windowBlocks: 100,
      budgetMs: 10_000,
      maxRows: 2,
      now: () => 0,
    });
    expect(out.done).toBe(false);
    expect(out.nextBlock).toBe(100);
    expect(out.rows).toHaveLength(2); // stopped at the boundary; next run takes 100+
  });

  it("leaves the cursor at the window start when the budget cuts mid-window", async () => {
    let clock = 0;
    const fake = new FakeAnkr({
      "0-99": [
        { txs: [tx("0xd1", 10)], nextPageToken: "0" },
        { txs: [tx("0xd2", 20)], nextPageToken: null },
      ],
    });
    const out = await fetchAnkrHistory(fake.client(), {
      chain: "base",
      chainId: 8453,
      address: SELF,
      startBlock: 0,
      safeHead: 99,
      windowBlocks: 100,
      budgetMs: 1,
      maxRows: 0,
      now: () => (clock += 1) * 10, // clock advances: budget exceeded before second page
    });
    expect(out.done).toBe(false);
    expect(out.nextBlock).toBe(0); // window re-covered whole next run
    expect(out.rows.map((r) => r.eventIdentifier)).toEqual(["0xd1"]);
  });
});

describe("fetchAnkrRecent", () => {
  it("polls from the cursor and never answers below it", async () => {
    const fake = new FakeAnkr({ "50-80": [{ txs: [tx("0xe1", 60)], nextPageToken: null }] });
    const out = await fetchAnkrRecent(fake.client(), {
      chain: "base",
      chainId: 8453,
      address: SELF,
      fromBlock: 50,
      safeHead: 80,
    });
    expect(out.rows).toHaveLength(1);
    expect(out.balanceWei).toBe("100");
    expect(out.lastBlock).toBe(80);
  });

  it("answers an empty round without moving the cursor back", async () => {
    const fake = new FakeAnkr({});
    const out = await fetchAnkrRecent(fake.client(), {
      chain: "base",
      chainId: 8453,
      address: SELF,
      fromBlock: 90,
      safeHead: 80,
    });
    expect(out.rows).toEqual([]);
    expect(out.lastBlock).toBe(89);
    // No transactions call for an inverted range.
    expect(fake.calls.filter((c) => c.kind === "transactions")).toHaveLength(0);
  });
});
