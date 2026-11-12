import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { decodeReceipts } from "./protocol-decode.js";
import { SEED_MANIFESTS } from "./manifests/index.js";
import { manifestForChain } from "./manifest.js";
import type { ReceiptLike } from "./protocol-decode.js";

const index = manifestForChain(SEED_MANIFESTS, 1);
const FRANK = "0x5C647cA5e2Bc5BD17c40410FcB8003D38879Ae50";

const load = (name: string): { receipt: ReceiptLike; account: string } => {
  // eslint-disable-next-line unicorn/prefer-module
  const raw = JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./__fixtures__/receipts/${name}.json`, import.meta.url)),
      "utf8",
    ),
  ) as {
    account: string;
    txHash: string;
    timestamp: number;
    value: string;
    to: string;
    logs: { address: string; topics: string[]; data: string; logIndex: number }[];
  };
  return {
    account: raw.account,
    receipt: {
      hash: raw.txHash,
      to: raw.to,
      value: raw.value,
      timestamp: new Date(raw.timestamp * 1000).toISOString(),
      logs: raw.logs,
    },
  };
};

const decode = (name: string, account?: string) => {
  const { receipt, account: fixtureAccount } = load(name);
  return decodeReceipts(index, 1, account ?? fixtureAccount, [receipt]);
};

describe("decodeReceipts - aave v3 supply", () => {
  it("tags the reserve leg DEPOSIT_ASSET and keeps the aToken mint generic", () => {
    const { rows, decodedTxHashes, inert } = decode("aave-supply");
    expect(inert).toBe(0);
    expect(decodedTxHashes).toHaveLength(1);
    expect(rows).toHaveLength(2);
    const spend = rows.find((r) => r.type === "SPEND");
    expect(spend).toMatchObject({
      subtype: "DEPOSIT_ASSET",
      asset: "eip155:1/erc20:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
      amount: "23680295108162211874",
      counterparty: "aave-v3",
      eventIdentifier: expect.stringContaining("-232"),
      timestamp: "2023-04-27T10:17:11.000Z",
    });
    const mint = rows.find((r) => r.subtype === "NONE");
    expect(mint).toMatchObject({
      type: "RECEIVE",
      asset: "eip155:1/erc20:0x0b925ed163218f6662a35e0f0371ac234f9e9371",
      counterparty: expect.stringMatching(/^0x/),
    });
  });
});

describe("decodeReceipts - aave v3 borrow", () => {
  it("tags the leg whose amount matches the event data BORROW", () => {
    const { rows } = decode("aave-borrow");
    const borrow = rows.find((r) => r.subtype === "BORROW");
    expect(borrow).toMatchObject({
      type: "RECEIVE",
      asset: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      amount: "15000000000",
      counterparty: "aave-v3",
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.subtype === "NONE")?.amount).toBe("15139048928");
  });
});

describe("decodeReceipts - uniswap v2 swap", () => {
  it("turns the account leg of a matched Swap into a TRADE", () => {
    const { rows, decodedTxHashes } = decode("uni-v2-swap");
    expect(decodedTxHashes).toHaveLength(1);
    expect(rows).toEqual([
      expect.objectContaining({
        type: "TRADE",
        subtype: "NONE",
        asset: "eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f",
        amount: "368782794148278446808",
        counterparty: "uniswap-v2",
      }),
    ]);
  });
});

describe("decodeReceipts - ENS registration", () => {
  it("synthesizes the native-fee NAME_REGISTRATION row", () => {
    const { rows, decodedTxHashes } = decode("ens-registration");
    expect(decodedTxHashes).toHaveLength(1);
    expect(rows).toEqual([
      expect.objectContaining({
        type: "SPEND",
        subtype: "NAME_REGISTRATION",
        asset: "eip155:1/slip44:60",
        amount: "41567886169361708",
        counterparty: "ens",
      }),
    ]);
  });
});

describe("decodeReceipts - sky conversion", () => {
  it("leaves transfers untouched when the protocol declares no events", () => {
    const { rows, decodedTxHashes, inert } = decode("sky-conversion");
    expect(inert).toBe(0);
    expect(decodedTxHashes).toEqual([]);
    expect(rows).toEqual([]);
  });
});

describe("decodeReceipts - inert protocols (Review-Focus 4)", () => {
  const ghost = structuredClone(SEED_MANIFESTS).map((entry) =>
    entry.id === "aave-v3"
      ? {
          ...entry,
          plugins: ["aave-decoder"],
          chains: entry.chains.map((chain) => ({
            ...chain,
            events: chain.events.map((event) => ({
              ...event,
              topic: `0x${"1".repeat(64)}`,
            })),
          })),
        }
      : entry,
  );
  const ghostIndex = manifestForChain(ghost, 1);

  it("counts the protocol inert and emits nothing", () => {
    const { receipt } = load("aave-supply");
    const result = decodeReceipts(ghostIndex, 1, FRANK, [receipt]);
    expect(result.inert).toBe(1);
    expect(result.rows).toEqual([]);
    expect(result.decodedTxHashes).toEqual([]);
  });

  it("keeps receipts of unknown txs entirely out of the result", () => {
    const { receipt } = load("aave-supply");
    const foreign = structuredClone(receipt);
    foreign.to = "0x1111111111111111111111111111111111111111";
    foreign.logs = foreign.logs.map((log) => ({
      ...log,
      address: "0x2222222222222222222222222222222222222222",
    }));
    const result = decodeReceipts(index, 1, FRANK, [foreign]);
    expect(result).toEqual({ rows: [], decodedTxHashes: [], inert: 0 });
  });
});
