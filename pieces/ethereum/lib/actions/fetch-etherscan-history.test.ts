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
      chainId: 1,
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
      chainId: 1,
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
      chainId: 1,
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
      chainId: 1,
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
      chainId: 1,
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
      chainId: 1,
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
      chainId: 1,
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
  it("stops at a window boundary once the row cap is hit", async () => {
    const page: EtherscanRow[] = [
      {
        hash: "0xcap",
        timeStamp: "1730000000",
        from: ADDR,
        to: "0x0000000000000000000000000000000000000002",
        value: "1",
        gasUsed: "21000",
        gasPrice: "1",
        status: "1",
      },
    ];
    const { client } = scriptClient({
      head: 500_000,
      pages: { txlist: [page, []] },
    });
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      chainId: 1,
      startBlock: 0,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 2,
      budgetMs: 60_000,
      maxRows: 2,
      now: () => 0,
    });
    // window 1 yields 2 rows (value + fee) -> stop at the first boundary
    expect(out.done).toBe(false);
    expect(out.nextBlock).toBe(100_000);
  });
  it("halves an oversized window instead of holding it in memory", async () => {
    // A window whose txlist never fits the page ceiling: the walk must
    // split the span down to the floor, import what fits at the floor,
    // and name the truncation - never accumulate the whole window.
    const seenSpans: number[] = [];
    const client = {
      async call(params: Record<string, string | number>) {
        if (params.action === "eth_blockNumber") return "0x2710"; // head 10000
        const span = Number(params.endblock) - Number(params.startblock);
        if (params.action === "txlist") {
          seenSpans.push(span);
          return [
            { hash: `0x${Number(params.startblock)}`, timeStamp: "1", from: ADDR,
              to: "0x2", value: "1", gasUsed: "0", gasPrice: "1", status: "1" },
            { hash: `0x${Number(params.startblock)}a`, timeStamp: "1", from: ADDR,
              to: "0x2", value: "1", gasUsed: "0", gasPrice: "1", status: "1" },
          ]; // 2 rows = pageSize, always full -> truncated at every span
        }
        return [];
      },
    };
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      chainId: 1,
      startBlock: 0,
      confirmations: 0,
      windowBlocks: 1000,
      pageSize: 2,
      budgetMs: 10_000,
      maxRows: 0,
      pagesPerWindow: 1,
      minWindowBlocks: 250,
      now: () => 0,
    });
    expect(seenSpans[0]).toBe(999); // full window first
    expect(seenSpans).toContain(249); // split down to the floor
    expect(out.skippedCategories).toContain("oversized-window");
    expect(out.nextBlock).toBeGreaterThan(0); // floor windows still progress
    expect(out.rows.length).toBeGreaterThan(0);
  });
});
// --- registry-aware decoding ------------------------------------------------

const POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2";
const WSTETH = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
const SUPPLY_TOPIC =
  "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61";
const TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const pad = (address: string) =>
  `0x${"0".repeat(24)}${address.toLowerCase().slice(2)}`;
const AMT = "23680295108162211874";

function decodingClient(opts: { logs?: unknown[] } = {}) {
  const seen: string[] = [];
  const client: HistoryClient = {
    async call(params) {
      const action = String(params.action);
      seen.push(`${String(params.module)}.${action}`);
      if (action === "eth_blockNumber") return "0x" + (200_000).toString(16);
      if (action === "getLogs") return opts.logs ?? [];
      if (action === "eth_getTransactionReceipt") {
        return {
          transactionHash: "0xaa",
          to: POOL,
          blockNumber: "0x1",
          logs: [
            {
              address: WSTETH,
              topics: [TRANSFER, pad(ADDR), pad(POOL)],
              data: `0x${BigInt(AMT).toString(16).padStart(64, "0")}`,
              logIndex: "0x0",
            },
            {
              address: POOL,
              topics: [SUPPLY_TOPIC],
              data: `0x${BigInt(AMT).toString(16).padStart(64, "0")}`,
              logIndex: "0x1",
            },
          ],
        };
      }
      if (action === "eth_getTransactionByHash") return { value: "0x0" };
      if (action === "eth_getBlockByNumber") return { timestamp: "0x65f00000" };
      const pages: Record<string, EtherscanRow[][]> = {};
      if (action === "txlist" && !("0" in pages)) return [TX];
      return [];
    },
  };
  return { client, seen };
}

const { manifestForChain } = await import("../manifest.js");
const { SEED_MANIFESTS } = await import("../manifests/index.js");
const REGISTRY_INDEX = manifestForChain(SEED_MANIFESTS, 1);

describe("fetchEtherscanHistory with a registry", () => {
  it("replaces the generic rows of decoded txs with semantic ones", async () => {
    const { client, seen } = decodingClient({
      logs: [
        {
          address: POOL,
          topics: [SUPPLY_TOPIC],
          data: "0x",
          logIndex: "0x1",
          transactionHash: "0xaa",
        },
      ],
    });
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      chainId: 1,
      startBlock: 0,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 10_000,
      budgetMs: 0,
      decode: { index: REGISTRY_INDEX },
    });
    expect(seen).toContain("logs.getLogs");
    expect(out.rows.find((r) => r.eventIdentifier === "0xaa")).toBeUndefined();
    const supply = out.rows.find((r) => r.subtype === "DEPOSIT_ASSET");
    expect(supply).toMatchObject({
      type: "SPEND",
      asset: `eip155:1/erc20:${WSTETH}`,
      amount: AMT,
      counterparty: "aave-v3",
      eventIdentifier: "0xaa-0",
    });
  });

  it("never calls the logs endpoint without a registry (regression pin)", async () => {
    const { client, seen } = decodingClient();
    const out = await fetchEtherscanHistory(client, {
      address: ADDR,
      chainId: 1,
      startBlock: 0,
      confirmations: 9,
      windowBlocks: 100_000,
      pageSize: 10_000,
      budgetMs: 0,
    });
    expect(out.rows.some((r) => r.eventIdentifier === "0xaa")).toBe(true);
    expect(seen.filter((s) => s.endsWith("getLogs"))).toEqual([]);
    expect(seen.filter((s) => s.startsWith("proxy."))).toEqual([
      "proxy.eth_blockNumber",
    ]);
  });
});
