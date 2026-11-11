import { describe, expect, it } from "vitest";
import {
  crawlAddressEndpoint,
  fetchBlockscoutHistory,
  type BlockscoutClient,
} from "./fetch-blockscout-history.js";

const ADDR = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";

function fake(
  pages: Record<string, Array<{
    items: Record<string, unknown>[];
    next_page_params: Record<string, string | number> | null;
  }>>,
): { client: BlockscoutClient; calls: string[] } {
  const calls: string[] = [];
  const cursors = new Map<string, number>();
  const client: BlockscoutClient = {
    async getPage(path) {
      calls.push(path);
      const key = path;
      const index = cursors.get(key) ?? 0;
      cursors.set(key, index + 1);
      const scripted = pages[key] ?? [
        { items: [], next_page_params: null },
      ];
      const page = scripted[Math.min(index, scripted.length - 1)];
      return {
        items: page.items,
        nextPageParams:
          index < scripted.length - 1 ? page.next_page_params : null,
      };
    },
  };
  return { client, calls };
}

const tx = (hash: string, block: number) => ({
  hash,
  block_number: block,
  from: { hash: ADDR },
  to: { hash: "0x0000000000000000000000000000000000000002" },
  value: "5",
  fee: "1",
  status: "ok",
  timestamp: "2024-12-13T15:06:22.000000Z",
});

describe("fetchBlockscoutHistory", () => {
  it("crawls to the oldest page and answers done at genesis", async () => {
    const { client } = fake({
      [`/addresses/${ADDR}/transactions`]: [
        { items: [tx("0xa1", 100)], next_page_params: { index: 1 } },
        { items: [tx("0xa2", 50)], next_page_params: null },
      ],
    });
    const out = await fetchBlockscoutHistory(client, {
      address: ADDR,
      chainId: 10,
      importedDownTo: Number.POSITIVE_INFINITY,
      budgetMs: 60_000,
      maxPages: 10,
      now: () => 0,
    });
    expect(out.done).toBe(true);
    expect(out.nextBlock).toBe(0);
    expect(out.rows.filter((r) => r.subtype === "FEE").map((r) => r.eventIdentifier).sort()).toEqual(["0xa1", "0xa2"]);
  });

  it("answers done without fetching when genesis is already reached", async () => {
    const { client, calls } = fake({});
    const out = await fetchBlockscoutHistory(client, {
      address: ADDR,
      chainId: 10,
      importedDownTo: 0,
      budgetMs: 60_000,
      maxPages: 10,
    });
    expect(out).toEqual({
      rows: [],
      nextBlock: 0,
      done: true,
      skippedCategories: [],
    });
    expect(calls).toEqual([]);
  });

  it("cuts the crawl at the time budget and answers the oldest block", async () => {
    let clock = 0;
    const { client } = fake({
      [`/addresses/${ADDR}/transactions`]: [
        { items: [tx("0xb1", 1000)], next_page_params: { index: 1 } },
        { items: [tx("0xb2", 900)], next_page_params: { index: 2 } },
        { items: [tx("0xb3", 800)], next_page_params: null },
      ],
    });
    const out = await fetchBlockscoutHistory(client, {
      address: ADDR,
      chainId: 10,
      importedDownTo: Number.POSITIVE_INFINITY,
      budgetMs: 50,
      maxPages: 10,
      now: () => (clock += 100),
    });
    expect(out.done).toBe(false);
    expect(out.nextBlock).toBe(1000);
  });
});

describe("crawlAddressEndpoint", () => {
  it("collects across pages and reports the oldest block", async () => {
    const { client } = fake({
      "/addresses/0x1/transactions": [
        { items: [{ block_number: 9 }], next_page_params: { index: 1 } },
        { items: [{ block_number: 4 }], next_page_params: null },
      ],
    });
    const out = await crawlAddressEndpoint(client, "0x1", "transactions", {
      budgetMs: 1000,
      maxPages: 5,
      now: () => 0,
    });
    expect(out.done).toBe(true);
    expect(out.oldestBlock).toBe(4);
    expect(out.items).toHaveLength(2);
  });
});
