/**
 * Bitcoin through the mempool.space (Esplora-dialect) read-only API -
 * the same indexer wallets use - plus BIP-84 watch-only derivation from
 * an account xpub. No key ever leaves the machine: everything here is
 * public chain data and public-key maths.
 *
 * The free public instance is rate-paced (a burst of address lookups is
 * exactly what the cluster throttles), and unconfirmed transactions are
 * never answered as ledger rows: their timestamp does not exist yet, and
 * the ledger id is the transaction, so an early import would freeze a
 * pending row forever. Confirmed-only is the honest v1.
 */
import { HDKey } from "@scure/bip32";
import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";

type FetchFn = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get?(name: string): string | null } | null;
  text(): Promise<string>;
}>;

export const DEFAULT_BITCOIN_BASE_URL = "https://mempool.space/api";
export const DEFAULT_BITCOIN_TESTNET_BASE_URL = "https://mempool.space/testnet/api";

/** Chain the wallet lives on; decided by the key/address, not the URL. */
export type BitcoinNetwork = "mainnet" | "testnet";

/** Chain-scope asset id (CSL): the genesis-hash namespace + SLIP-44 coin. */
export function bitcoinAssetId(network: BitcoinNetwork): string {
  return network === "testnet"
    ? "bip122:000000000933ea01ad0ee984209779ba/slip44:1"
    : "bip122:000000000019d6689c085ae165831e93/slip44:0";
}

const XPUB_PREFIXES = /^(xpub|ypub|zpub|Ypub|Zpub)/;
const TESTNET_XPUB_PREFIXES = /^(tpub|vpub|uppub|Vpub)/;

/** True when the string is a base58 extended public key (any prefix). */
export function isXpub(value: string): boolean {
  const trimmed = value.trim();
  return (
    (XPUB_PREFIXES.test(trimmed) || TESTNET_XPUB_PREFIXES.test(trimmed)) &&
    /^[1-9A-HJ-NP-Za-km-z]{100,200}$/.test(trimmed)
  );
}

/** The network a watch-only target belongs to: xpub version bytes first,
 * then the bech32/legacy address prefix. */
export function networkOf(target: string): BitcoinNetwork {
  const value = target.trim();
  if (TESTNET_XPUB_PREFIXES.test(value)) return "testnet";
  if (XPUB_PREFIXES.test(value)) return "mainnet";
  if (value.startsWith("tb1") || value.startsWith("BC1")) return "testnet";
  if (/^[mn]/.test(value)) return "testnet";
  return "mainnet";
}

/** One page of a wallet's transactions, newest first (Esplora dialect). */
export interface BitcoinTx {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
  vin: Array<{
    txid?: string;
    vout?: number;
    prevout?: { scriptpubkey_address?: string; value?: number } | null;
    scriptsig?: string;
  }>;
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

export interface BitcoinUtxo {
  txid: string;
  vout: number;
  value: number;
}

export interface BitcoinClient {
  /** The chain tip height. */
  tipHeight(): Promise<number>;
  /** One newest-first page of an address's transactions; `afterTxid`
   * continues deeper (transactions older than that id). */
  addressTxs(address: string, afterTxid?: string): Promise<BitcoinTx[]>;
  /** The address's confirmed unspent outputs - the balance. */
  addressUtxos(address: string): Promise<BitcoinUtxo[]>;
}

/** `Retry-After` in seconds (or an HTTP date), clamped to a polite wait;
 * null when the header is absent or unparsable. */
function retryAfterMsOf(headers: { get?(name: string): string | null } | null | undefined): number | null {
  const raw = headers?.get?.("retry-after") ?? null;
  if (raw === null) return null;
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : new Date(raw).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.min(ms, 30_000);
}

export function createBitcoinClient(opts: {
  baseUrl?: string;
  fetchImpl?: FetchFn;
  /** Delay between calls, ms; the free cluster throttles bursts. */
  paceMs?: number;
  /** Extra retries on 429/5xx beyond the first try. Default 4. */
  maxRetries?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}): BitcoinClient {
  const base = (opts.baseUrl ?? DEFAULT_BITCOIN_BASE_URL).replace(/\/+$/, "");
  const doFetch = opts.fetchImpl ?? (fetch);
  const paceMs = opts.paceMs ?? 250;
  const maxRetries = opts.maxRetries ?? 4;
  const sleep =
    opts.sleepImpl ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastCallAt = 0;

  async function getJson(path: string): Promise<unknown> {
    const wait = lastCallAt + paceMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    // The free mempool.space cluster answers 429 under load; back off
    // (honoring Retry-After when the edge sends one) and retry so a whole
    // wallet walk doesn't die on one throttled page.
    let backoff = 1000;
    for (let attempt = 0; ; attempt += 1) {
      let response;
      try {
        response = await doFetch(`${base}${path}`);
      } catch (networkError) {
        // A dropped keep-alive socket mid-walk is as transient as a 503;
        // back off and retry rather than fail the whole wallet on it.
        if (attempt >= maxRetries) throw networkError;
        await sleep(Math.min(backoff, 15_000));
        backoff *= 2;
        lastCallAt = Date.now();
        continue;
      }
      if (response.ok) return JSON.parse(await response.text());
      const retryable = response.status === 429 || response.status >= 500;
      const body = (await response.text()).slice(0, 180);
      if (!retryable || attempt >= maxRetries) {
        throw new Error(`Bitcoin API ${path} answered ${response.status}: ${body}`);
      }
      const retryAfterMs = retryAfterMsOf(response.headers);
      const delay = retryAfterMs ?? Math.min(backoff, 15_000);
      await sleep(delay);
      backoff *= 2;
      // A throttled call also means the next one should wait its turn.
      lastCallAt = Date.now();
    }
  }

  return {
    async tipHeight() {
      const tip = await getJson("/blocks/tip/height");
      if (typeof tip !== "number" || !Number.isFinite(tip)) {
        throw new Error("Bitcoin API /blocks/tip/height did not answer a height.");
      }
      return tip;
    },
    async addressTxs(address, afterTxid) {
      const query = afterTxid ? `?after_txid=${encodeURIComponent(afterTxid)}` : "";
      const page = await getJson(
        `/address/${encodeURIComponent(address)}/txs${query}`,
      );
      if (!Array.isArray(page)) {
        throw new Error(`Bitcoin API address/${address}/txs did not answer a list.`);
      }
      return page as BitcoinTx[];
    },
    async addressUtxos(address) {
      const page = await getJson(`/address/${encodeURIComponent(address)}/utxo`);
      if (!Array.isArray(page)) {
        throw new Error(`Bitcoin API address/${address}/utxo did not answer a list.`);
      }
      return page as BitcoinUtxo[];
    },
  };
}

// ---------------------------------------------------------------------------
// BIP-84 watch-only derivation
// ---------------------------------------------------------------------------

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data));
}

/** P2WPKH (native segwit, bech32 witness-v0) address for a compressed
 * public key on the given network. */
export function p2wpkhAddress(publicKey: Uint8Array, network: BitcoinNetwork): string {
  const prefix = network === "testnet" ? "tb" : "bc";
  return bech32.encode(prefix, [0, ...bech32.toWords(hash160(publicKey))]);
}

/** One address plus the BIP-84 derivation path it came from ("" for a
 * plain address target). */
export interface BitcoinTarget {
  address: string;
  derivationPath: string;
}

/** Version bytes per serialization prefix (BIP-32 + SLIP-132): the key
 * string says which network it was serialized for; the derivation path
 * inside says which coin - both are honored by parsing with versions. */
const KEY_VERSIONS: Record<string, { private: number; public: number }> = {
  tpub: { private: 0x04358394, public: 0x043587cf },
  vpub: { private: 0x045f1bcd, public: 0x045f1cf6 },
  upub: { private: 0x044a4e28, public: 0x044a5262 },
};

function parseAccountKey(xpub: string): HDKey {
  for (const [prefix, versions] of Object.entries(KEY_VERSIONS)) {
    if (xpub.startsWith(prefix)) return HDKey.fromExtendedKey(xpub, versions);
  }
  return HDKey.fromExtendedKey(xpub);
}

/**
 * The address set of a watch-only target: one address, or an account xpub
 * expanded across both BIP-84 chains (0 receive, 1 change), indices
 * 0..gapLimit-1. BIP-44 says 20 empty addresses end the scan; a fixed
 * window answers every wallet whose used indices sit inside the first
 * chain of 20 - the far-rarer deeper wallets are the operator's call to
 * raise `gapLimit`.
 */
export function expandTargets(
  target: string,
  network: BitcoinNetwork,
  gapLimit = 20,
): BitcoinTarget[] {
  const value = target.trim();
  if (XPUB_PREFIXES.test(value) || TESTNET_XPUB_PREFIXES.test(value)) {
    const account = parseAccountKey(value);
    const targets: BitcoinTarget[] = [];
    for (const chain of [0, 1]) {
      for (let index = 0; index < gapLimit; index += 1) {
        const key = account.deriveChild(chain).deriveChild(index);
        targets.push({
          address: p2wpkhAddress(key.publicKey as Uint8Array, network),
          derivationPath: `${chain}/${index}`,
        });
      }
    }
    return targets;
  }
  return [{ address: value, derivationPath: "" }];
}
