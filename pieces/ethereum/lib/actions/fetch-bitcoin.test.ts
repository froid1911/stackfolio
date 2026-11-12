import { describe, expect, it } from "vitest";
import {
  fetchBitcoinHistory,
  walkBitcoinAddress,
} from "./fetch-bitcoin-history.js";
import { fetchBitcoinRecent } from "./fetch-bitcoin-recent.js";
import type { BitcoinClient, BitcoinTx } from "../bitcoin.js";

const OWN = "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl";
const OTHER = "tb1qd7spv5q28348xl4myc8zmh983w5jx32cjhkn97";
const ASSET = "bip122:000000000933ea01ad0ee984209779ba/slip44:1";

const tx = (txid: string, height: number): BitcoinTx => ({
  txid,
  status: { confirmed: true, block_height: height, block_time: 1_700_000_000 + height },
  vin: [{ prevout: { scriptpubkey_address: OTHER, value: 1_000 } }],
  vout: [{ scriptpubkey_address: OWN, value: 1_000 }],
});

function fakeClient(
  pagesByAddress: Record<string, BitcoinTx[][]>,
  opts: { tip?: number; utxos?: Record<string, Array<{ txid: string; vout: number; value: number }>> } = {},
): BitcoinClient {
  return {
    async tipHeight() {
      return opts.tip ?? 2_000_000;
    },
    async addressTxs(address, afterTxid) {
      const pages = pagesByAddress[address] ?? [];
      if (!afterTxid) return pages[0] ?? [];
      const index = pages.findIndex((page) =>
        page.some((item) => item.txid === afterTxid),
      );
      return index >= 0 ? (pages[index + 1] ?? []) : [];
    },
    async addressUtxos(address) {
      return opts.utxos?.[address] ?? [];
    },
  };
}

describe("walkBitcoinAddress", () => {
  it("crawls deeper until an empty page answers done", async () => {
    const client = fakeClient({ [OWN]: [[tx("a1", 100)], [tx("a2", 50)], []] });
    const walk = await walkBitcoinAddress(client, OWN, {
      importedDownTo: Number.POSITIVE_INFINITY,
      maxPages: 10,
    });
    expect(walk.txs.map((item) => item.txid)).toEqual(["a1", "a2"]);
    expect(walk.done).toBe(true);
    expect(walk.oldestHeight).toBe(50);
  });

  it("stops at the first page older than the cursor and calls it done", async () => {
    const client = fakeClient({ [OWN]: [[tx("a1", 100), tx("a2", 60)]] });
    const walk = await walkBitcoinAddress(client, OWN, {
      importedDownTo: 90,
      maxPages: 10,
    });
    expect(walk.done).toBe(true);
    expect(walk.oldestHeight).toBe(60);
  });

  it("leaves done false when the page budget runs out mid-history", async () => {
    const client = fakeClient({ [OWN]: [[tx("a1", 100)], [tx("a2", 90)]] });
    const walk = await walkBitcoinAddress(client, OWN, {
      importedDownTo: Number.POSITIVE_INFINITY,
      maxPages: 2,
    });
    expect(walk.done).toBe(false);
  });
});

describe("fetchBitcoinHistory", () => {
  it("rests at 0 when a finished walk has nothing left", async () => {
    const client = fakeClient({});
    const out = await fetchBitcoinHistory(client, {
      targets: [{ address: OWN, derivationPath: "" }],
      asset: ASSET,
      importedDownTo: 0,
      tipHeight: 2_000_000,
      maxPagesPerAddress: 4,
    });
    expect(out).toEqual({ rows: [], nextBlock: 0, done: true });
  });

  it("merges addresses, dedupes shared txids and counts down the cursor", async () => {
    const second = "tb1q9u62588spffmq4dzjxsr5l297znf3z6j5p2688";
    const shared = tx("same", 120);
    const client = fakeClient({
      [OWN]: [[shared], []],
      [second]: [[shared, tx("only2", 80)], []],
    });
    const out = await fetchBitcoinHistory(client, {
      targets: [
        { address: OWN, derivationPath: "0/0" },
        { address: second, derivationPath: "0/1" },
      ],
      asset: ASSET,
      importedDownTo: Number.POSITIVE_INFINITY,
      tipHeight: 2_000_000,
      maxPagesPerAddress: 4,
    });
    expect(out.done).toBe(true);
    expect(out.nextBlock).toBe(0);
    expect(new Set(out.rows.map((row) => row.eventIdentifier))).toEqual(
      new Set(["same", "only2"]),
    );
  });

  it("answers the oldest confirmed height when the walk is budget-starved", async () => {
    const client = fakeClient({ [OWN]: [[tx("a1", 150), tx("a2", 140)]] });
    const out = await fetchBitcoinHistory(client, {
      targets: [{ address: OWN, derivationPath: "" }],
      asset: ASSET,
      importedDownTo: Number.POSITIVE_INFINITY,
      tipHeight: 2_000_000,
      maxPagesPerAddress: 1,
    });
    expect(out.done).toBe(false);
    expect(out.nextBlock).toBe(140);
  });

  it("bounds an untouched first walk at the tip", async () => {
    const client = fakeClient({ [OWN]: [] });
    const out = await fetchBitcoinHistory(client, {
      targets: [{ address: OWN, derivationPath: "" }],
      asset: ASSET,
      importedDownTo: Number.POSITIVE_INFINITY,
      tipHeight: 500_000,
      maxPagesPerAddress: 4,
    });
    expect(out.done).toBe(true);
    expect(out.nextBlock).toBe(0);
  });
});

describe("fetchBitcoinRecent", () => {
  it("collects confirmed rows above the cursor and sums the UTXO balance", async () => {
    const client = fakeClient(
      { [OWN]: [[tx("new", 300), tx("old", 250)]] },
      { tip: 305, utxos: { [OWN]: [{ txid: "new", vout: 0, value: 700 }] } },
    );
    const out = await fetchBitcoinRecent(client, {
      targets: [{ address: OWN }],
      asset: ASSET,
      aboveHeight: 260,
    });
    expect(out.rows.map((row) => row.eventIdentifier)).toEqual(["new"]);
    expect(out.balanceSats).toBe("700");
    expect(out.lastBlock).toBe(305);
  });

  it("rides the tip even when nothing moved", async () => {
    const client = fakeClient({ [OWN]: [] }, { tip: 400 });
    const out = await fetchBitcoinRecent(client, {
      targets: [{ address: OWN }],
      asset: ASSET,
      aboveHeight: 390,
    });
    expect(out.rows).toEqual([]);
    expect(out.balanceSats).toBe("0");
    expect(out.lastBlock).toBe(400);
  });
});
