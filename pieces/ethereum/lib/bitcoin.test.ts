import { describe, expect, it } from "vitest";
import {
  bitcoinAssetId,
  createBitcoinClient,
  expandTargets,
  isXpub,
  networkOf,
  p2wpkhAddress,
} from "./bitcoin.js";

// The BIP-84 account key (m/84'/1'/0') of the standard "abandon ... about"
// test mnemonic, testnet-serialized; addresses below are the library's
// derivation vectors (and real testnet history anchors).
const ABANDON_TESTNET_XPUB =
  "tpubDC8msFGeGuwnKG9Upg7DM2b4DaRqg3CUZa5g8v2SRQ6K4NSkxUgd7HsL2XVWbVm3" +
  "9yBA4LAxysQAm397zwQSQoQgewGiYZqrA9DsP4zbQ1M";

function fakeFetch(
  routes: Record<string, unknown>,
): {
  fetchImpl: (url: string) => Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
  }>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetchImpl: async (url: string) => {
      calls.push(url);
      const key = url.replace("https://mempool.space/api", "") || "/";
      const answer = routes[key];
      if (answer === undefined) {
        return { ok: false, status: 404, text: async () => "endpoint does not exist" };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(answer) };
    },
  };
}

describe("networkOf / isXpub", () => {
  it("reads the network off the key or address prefix", () => {
    expect(networkOf(ABANDON_TESTNET_XPUB)).toBe("testnet"); // tpub bytes
    expect(networkOf("xpub6Bm9M1SxZdzL3TxdNV8897FgtTLBgehR1wVNnMyJ5VLRK5n3tFqXxrCVnVQj4zooN4eFSkf6Sma84reWc5ZCXMxPbLXQs3BcaBdTd4YQa3B")).toBe("mainnet");
    expect(networkOf("vpub5TkL3EjH8cM2testvpubprefix")).toBe("testnet");
    expect(networkOf("tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl")).toBe("testnet");
    expect(networkOf("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")).toBe("mainnet");
  });

  it("recognizes extended public keys only in full", () => {
    expect(isXpub(ABANDON_TESTNET_XPUB)).toBe(true);
    expect(isXpub("xpub-not base58 here")).toBe(false);
    expect(isXpub("tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl")).toBe(false);
  });
});

describe("asset ids", () => {
  it("names the chain and coin of each network", () => {
    expect(bitcoinAssetId("mainnet")).toBe(
      "bip122:000000000019d6689c085ae165831e93/slip44:0",
    );
    expect(bitcoinAssetId("testnet")).toBe(
      "bip122:000000000933ea01ad0ee984209779ba/slip44:1",
    );
  });
});

describe("BIP-84 derivation", () => {
  it("derives the abandon-seed BIP-84 testnet receive vector", () => {
    const targets = expandTargets(ABANDON_TESTNET_XPUB, "testnet", 2);
    expect(targets[0]).toEqual({
      address: "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl",
      derivationPath: "0/0",
    });
    expect(targets[2]).toEqual({
      address: "tb1q9u62588spffmq4dzjxsr5l297znf3z6j5p2688",
      derivationPath: "1/0",
    });
  });

  it("expands both chains across the gap limit", () => {
    const targets = expandTargets(ABANDON_TESTNET_XPUB, "testnet", 3);
    expect(targets).toHaveLength(6);
    expect(targets.map((t) => t.derivationPath)).toEqual([
      "0/0",
      "0/1",
      "0/2",
      "1/0",
      "1/1",
      "1/2",
    ]);
  });

  it("passes a plain address through untouched", () => {
    const addr = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
    expect(expandTargets(addr, "mainnet", 20)).toEqual([
      { address: addr, derivationPath: "" },
    ]);
  });

  it("encodes mainnet P2WPKH with the bc prefix", () => {
    // Genesis coinbase key is not meaningful here; check the shape only.
    const pubkey = new Uint8Array(33).fill(2);
    expect(p2wpkhAddress(pubkey, "mainnet")).toMatch(/^bc1q[02-9a-hj-np-z]{38}$/);
  });
});

describe("createBitcoinClient", () => {
  it("answers the tip height", async () => {
    const { fetchImpl } = fakeFetch({ "/blocks/tip/height": 2_450_000 });
    const client = createBitcoinClient({ fetchImpl, paceMs: 0 });
    await expect(client.tipHeight()).resolves.toBe(2_450_000);
  });

  it("builds the after_txid cursor into the deeper page path", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "/address/tb1qxyz/txs?after_txid=aaa": [],
    });
    const client = createBitcoinClient({ fetchImpl, paceMs: 0 });
    await client.addressTxs("tb1qxyz", "aaa");
    expect(calls[0]).toBe(
      "https://mempool.space/api/address/tb1qxyz/txs?after_txid=aaa",
    );
  });

  it("reports the API status when an endpoint fails", async () => {
    const { fetchImpl } = fakeFetch({});
    const client = createBitcoinClient({ fetchImpl, paceMs: 0 });
    await expect(client.addressUtxos("tb1qxyz")).rejects.toThrow(/404/);
  });

  it("paces consecutive calls", async () => {
    const { fetchImpl } = fakeFetch({ "/blocks/tip/height": 10 });
    const sleeps: number[] = [];
    const client = createBitcoinClient({
      fetchImpl,
      paceMs: 200,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
    });
    await client.tipHeight();
    await client.tipHeight();
    expect(sleeps.length).toBeGreaterThan(0);
    expect(sleeps[0]).toBeGreaterThan(0);
  });

  it("retries a throttled call and succeeds, honoring Retry-After", async () => {
    let tries = 0;
    const sleeps: number[] = [];
    const client = createBitcoinClient({
      paceMs: 0,
      sleepImpl: async (ms) => {
        sleeps.push(ms);
      },
      fetchImpl: async () => {
        tries += 1;
        if (tries === 1) {
          return {
            ok: false,
            status: 429,
            headers: { get: () => "3" },
            text: async () => "Too Many Requests",
          };
        }
        return { ok: true, status: 200, text: async () => "12345" };
      },
    });
    await expect(client.tipHeight()).resolves.toBe(12345);
    expect(tries).toBe(2);
    // The Retry-After of 3 seconds was honored (3000ms) before the retry.
    expect(sleeps).toContain(3000);
  });

  it("retries a dropped socket and succeeds", async () => {
    let tries = 0;
    const client = createBitcoinClient({
      paceMs: 0,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        tries += 1;
        if (tries === 1) throw new TypeError("fetch failed");
        return { ok: true, status: 200, text: async () => "777" };
      },
    });
    await expect(client.tipHeight()).resolves.toBe(777);
    expect(tries).toBe(2);
  });

  it("gives up with the API status once the retry budget is spent", async () => {
    let tries = 0;
    const client = createBitcoinClient({
      paceMs: 0,
      maxRetries: 2,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        tries += 1;
        return { ok: false, status: 503, text: async () => "unavailable" };
      },
    });
    await expect(client.tipHeight()).rejects.toThrow(/503/);
    expect(tries).toBe(3); // first try + 2 retries
  });
});
