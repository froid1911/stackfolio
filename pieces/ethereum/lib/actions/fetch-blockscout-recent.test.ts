import { describe, expect, it } from "vitest";
import {
  fetchBlockscoutRecent,
  type BlockscoutClient,
} from "./fetch-blockscout-recent.js";

const ADDR = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const OTHER = "0x0000000000000000000000000000000000000002";

const tx = (hash: string, block: number) => ({
  hash,
  block_number: block,
  from: { hash: ADDR },
  to: { hash: OTHER },
  value: "5",
  fee: "1",
  status: "ok",
  timestamp: "2024-12-13T15:06:22.000000Z",
});

function fake(
  pages: Record<string, Array<{
    items: Record<string, unknown>[];
    next_page_params: Record<string, string | number> | null;
  }>>,
  balance = "777",
): BlockscoutClient {
  const cursors = new Map<string, number>();
  return {
    async getPage(path) {
      const index = cursors.get(path) ?? 0;
      cursors.set(path, index + 1);
      const scripted = pages[path] ?? [{ items: [], next_page_params: null }];
      const page = scripted[Math.min(index, scripted.length - 1)];
      return {
        items: page.items,
        nextPageParams: index < scripted.length - 1 ? page.next_page_params : null,
      };
    },
    async getObject() {
      return { coin_balance: balance };
    },
  };
}

describe("fetchBlockscoutRecent", () => {
  it("keeps only blocks at or above the cursor and reports the head", async () => {
    const client = fake({
      [`/addresses/${ADDR}/transactions`]: [
        {
          items: [tx("0xf1", 100), tx("0xf2", 80), tx("0xf3", 40)],
          next_page_params: null,
        },
      ],
    });
    const out = await fetchBlockscoutRecent(client, ADDR, 10, {
      fromBlock: 60,
      maxPages: 5,
    });
    expect([...new Set(out.rows.map((r) => r.eventIdentifier))].sort()).toEqual([
      "0xf1",
      "0xf2",
    ]);
    expect(out.lastBlock).toBe(100);
    expect(out.balanceWei).toBe("777");
  });

  it("advances the cursor even with nothing new", async () => {
    const client = fake({
      [`/addresses/${ADDR}/transactions`]: [
        { items: [tx("0xf1", 10)], next_page_params: null },
      ],
    });
    const out = await fetchBlockscoutRecent(client, ADDR, 10, {
      fromBlock: 60,
      maxPages: 5,
    });
    expect(out.rows).toEqual([]);
    expect(out.lastBlock).toBe(59);
  });
});
