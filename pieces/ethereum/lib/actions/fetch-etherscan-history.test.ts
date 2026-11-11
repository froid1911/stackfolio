import { describe, expect, it } from "vitest";
import { EtherscanError, type EtherscanRow } from "../etherscan.js";
import {
  fetchEtherscanHistory,
  type HistoryClient,
} from "./fetch-etherscan-history.js";

const ADDR = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";

function scriptClient(opts: {
  head: number;
  txs?: EtherscanRow[];
  pages?: Record<string, EtherscanRow[][]>;
  failCategory?: string;
}): { client: HistoryClient; calls: string[] } {
  const calls: string[] = [];
  const client = {
    async call(params: Record<string, string | number>): Promise<unknown> {
      const action = String(params.action);
      calls.push(`${action}:${params.page ?? 1}`);
      if (action === "eth_blockNumber") {
        return "0x" + opts.head.toString(16);
      }
      if (opts.failCategory === action) {
        throw new EtherscanError("not available for your plan", "unavailable");
      }
      const pages = opts.pages?.[action] ?? [];
      const pageNo = Number(params.page ?? 1);
      if (pages.length >= pageNo) return pages[pageNo - 1];
      return action === "txlist" && opts.txs && pageNo === 1
        ? opts.txs
        : [];
    },
  };
  return { client, calls };
}

const TX = {
  hash: "0xaa",
  timeStamp: "1730000000",
  from: "0x0000000000000000000000000000000000000001",
  to: ADDR,
  value: "1000000000000000000",
  gasUsed: "21000",
  gasPrice: "20000000000",
  status: "1",
};

describe("fetchEtherscanHistory", () => {
  it("maps the first window and advances the cursor", async () => {
    const { client } = scriptClient({ head: 200_000, txs: [TX] });
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      startBlock: 0,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 10_000,
      budgetMs: 0,
    });
    expect(out.done).toBe(false);
    expect(out.nextBlock).toBe(100_000);
    expect(out.rows[0]).toMatchObject({
      eventIdentifier: "0xaa",
      type: "RECEIVE",
    });
  });

  it("answers done without fetching beyond head minus confirmations", async () => {
    const { client, calls } = scriptClient({ head: 50_000 });
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      startBlock: 49_992,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 10_000,
      budgetMs: 0,
    });
    expect(out).toMatchObject({ done: true, rows: [], nextBlock: 49_992 });
    expect(calls.filter((c) => !c.startsWith("eth_blockNumber"))).toEqual([]);
  });

  it("skips a plan-gated category and keeps the others", async () => {
    const { client } = scriptClient({
      head: 200_000,
      txs: [TX],
      failCategory: "tokenApprovals",
    });
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      startBlock: 0,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 10_000,
      budgetMs: 0,
    });
    expect(out.skippedCategories).toEqual(["approvals"]);
    expect(out.rows.length).toBeGreaterThan(0);
  });

  it("rethrows auth errors", async () => {
    const client: HistoryClient = {
      async call(params) {
        if (String(params.action) === "eth_blockNumber") {
          throw new EtherscanError("Etherscan rejected the API key", "auth");
        }
        return [];
      },
    };
    await expect(
      fetchEtherscanHistory(client, {
        address: ADDR,
        startBlock: 0,
        confirmations: 9,
        windowBlocks: 100_000,
        pageSize: 10_000,
        budgetMs: 0,
      }),
    ).rejects.toBeInstanceOf(EtherscanError);
  });

  it("follows pagination after a full page", async () => {
    const page1: EtherscanRow[] = Array.from({ length: 2 }, (_, i) => ({
      hash: `0xfull${i}`,
      timeStamp: "1730000000",
      from: ADDR,
      to: "0x0000000000000000000000000000000000000002",
      value: "1",
      gasUsed: "21000",
      gasPrice: "1",
      status: "1",
    }));
    const { client, calls } = scriptClient({
      head: 200_000,
      pages: { txlist: [page1, []] },
    });
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      startBlock: 0,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 2,
      budgetMs: 0,
    });
    expect(calls.filter((c) => c.startsWith("txlist:"))).toEqual([
      "txlist:1",
      "txlist:2",
    ]);
    expect(out.rows.filter((r) => r.subtype === "FEE")).toHaveLength(2);
  });
  it("walks consecutive windows while the budget holds", async () => {
    const { client, calls } = scriptClient({ head: 300_000, txs: [TX] });
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      startBlock: 0,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 10_000,
      budgetMs: 60_000,
      now: () => 0,
    });
    expect(calls.filter((c) => c === "txlist:1")).toHaveLength(3);
    expect(out).toMatchObject({ nextBlock: 299_992, done: true });
    expect(out.rows).toHaveLength(3);
  });

  it("cuts the walk at a window boundary when the clock runs out", async () => {
    const times = [0, 100_000];
    let tick = 0;
    const { client, calls } = scriptClient({ head: 500_000, txs: [TX] });
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      startBlock: 0,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 10_000,
      budgetMs: 50_000,
      now: () => times[Math.min(tick++, times.length - 1)],
    });
    expect(calls.filter((c) => c === "txlist:1")).toHaveLength(1);
    expect(out).toMatchObject({ nextBlock: 100_000, done: false });
  });
});