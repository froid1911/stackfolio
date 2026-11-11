import { describe, expect, it } from "vitest";
import { EtherscanError, type EtherscanRow } from "../etherscan.js";
import {
  fetchEtherscanRecent,
  type RecentClient,
} from "./fetch-etherscan-recent.js";

const ADDR = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";

function scriptClient(opts: {
  head: number;
  balance: string;
  txs?: EtherscanRow[];
  failCategory?: string;
}): { client: RecentClient; calls: string[] } {
  const calls: string[] = [];
  const client = {
    async call(params: Record<string, string | number>): Promise<unknown> {
      const action = String(params.action);
      calls.push(action);
      if (action === "eth_blockNumber") {
        return "0x" + opts.head.toString(16);
      }
      if (action === "balance") {
        return opts.balance;
      }
      if (opts.failCategory === action) {
        throw new EtherscanError("not available for your plan", "unavailable");
      }
      return action === "txlist" && opts.txs ? opts.txs : [];
    },
  };
  return { client, calls };
}

describe("fetchEtherscanRecent", () => {
  it("returns rows, a fresh balance and the covered block", async () => {
    const { client } = scriptClient({
      head: 100,
      balance: "0x3635c9adc5dea00000",
      txs: [
        {
          hash: "0xa1",
          timeStamp: "1730000000",
          from: "0x0000000000000000000000000000000000000001",
          to: ADDR,
          value: "1000",
          gasUsed: "21000",
          gasPrice: "1",
          status: "1",
        },
      ],
    });
    const out = await fetchEtherscanRecent(client, {
      address: ADDR,
      chainId: 1,
      fromBlock: 90,
      confirmations: 9,
      pageSize: 10_000,
    });
    expect(out.rows).toHaveLength(1);
    expect(out.balanceWei).toBe("1000000000000000000000");
    expect(out.lastBlock).toBe(91);
    expect(out.skippedCategories).toEqual([]);
  });

  it("an empty window still answers the balance and never moves the block back", async () => {
    const { client } = scriptClient({ head: 95, balance: "0x1" });
    const out = await fetchEtherscanRecent(client, {
      address: ADDR,
      chainId: 1,
      fromBlock: 90,
      confirmations: 9,
      pageSize: 10_000,
    });
    expect(out.rows).toEqual([]);
    expect(out.balanceWei).toBe("1");
    expect(out.lastBlock).toBe(89);
  });

  it("skips an unavailable category but keeps rows and balance", async () => {
    const { client } = scriptClient({
      head: 100,
      balance: "0x2",
      failCategory: "txlistinternal",
    });
    const out = await fetchEtherscanRecent(client, {
      address: ADDR,
      chainId: 1,
      fromBlock: 90,
      confirmations: 9,
      pageSize: 10_000,
    });
    expect(out.skippedCategories).toEqual(["internal"]);
    expect(out.balanceWei).toBe("2");
  });

  it("a transient failure aborts the run", async () => {
    const client: RecentClient = {
      async call(params) {
        if (String(params.action) === "balance") {
          throw new EtherscanError("backing off", "transient");
        }
        return "0x64";
      },
    };
    await expect(
      fetchEtherscanRecent(client, {
        address: ADDR,
      chainId: 1,
        fromBlock: 90,
        confirmations: 9,
        pageSize: 10_000,
      }),
    ).rejects.toBeInstanceOf(EtherscanError);
  });
});
