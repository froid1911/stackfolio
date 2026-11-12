/**
 * The Etherscan V2 client: the portfolio's source of chain history and
 * head data. One client per action run; calls are serialized and spaced
 * (the free tier allows 5 requests per second and the account-wide cap
 * resets per second), with backoff for transient pressure. Errors carry
 * a category so import actions can tell "the key is wrong" (fix it) from
 * "this endpoint is beyond your plan" (skip the category) from "the
 * network is sulking" (retry next run at the same cursor). The key is
 * never part of any message that leaves this file.
 */

// Shared pacing and per-key gates so Etherscan and Blockscout clients
// meter by key, the way the providers meter.
import { keyGates, RETRY_DELAYS_MS } from "./gate.js";

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Where immutable Etherscan answers are kept: this process's working
 * directory's build cache, overridable with STACKFOLIO_ETHERSCAN_CACHE
 * ("off" turns the cache off entirely). A second walk of a walked
 * history - the retrofit, a retry after a restart, a wallet added
 * tomorrow - answers from disk instead of the API and the key's
 * throttle budget.
 */
export function etherscanCacheDir(): string | undefined {
  const env = process.env.STACKFOLIO_ETHERSCAN_CACHE?.trim();
  if (env !== undefined && env !== "") {
    return env === "off" ? undefined : env;
  }
  return join(process.cwd(), "node_modules/.cache/etherscan");
}

/**
 * Whether a call's answer can never change: a bounded window of
 * account history or logs (every caller ends its windows below the safe
 * head, so the window is final by construction), or a receipt, a
 * transaction or a numbered block. The head itself and "latest" state
 * are answered fresh, always.
 */
export function isImmutableCall(params: Record<string, string | number>): boolean {
  const action = String(params.action ?? "");
  if (params.module === "account") {
    return (
      ["txlist", "txlistinternal", "tokentx", "tokenApprovals"].includes(action) &&
      Number.isFinite(Number(params.endblock)) &&
      String(params.endblock) !== ""
    );
  }
  if (params.module === "logs" && action === "getLogs") {
    return (
      Number.isFinite(Number(params.endblock)) && String(params.endblock) !== ""
    );
  }
  if (params.module === "proxy") {
    if (["eth_getTransactionReceipt", "eth_getTransactionByHash"].includes(action)) {
      return true;
    }
    // A numbered block is final once fetched; "latest" is whatever the
    // chain believes right now.
    return (
      action === "eth_getBlockByNumber" && String(params.tag ?? "").startsWith("0x")
    );
  }
  return false;
}

const cacheKey = (
  chainId: number,
  params: Record<string, string | number>,
): string => {
  const normalized = Object.fromEntries(
    Object.entries(params)
      .filter(([name]) => name !== "apikey")
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  return createHash("sha256")
    .update(JSON.stringify([chainId, normalized]))
    .digest("hex");
};

export type EtherscanRow = Record<string, string | undefined>;

export class EtherscanError extends Error {
  constructor(
    message: string,
    readonly category: "auth" | "unavailable" | "transient",
  ) {
    super(message);
    this.name = "EtherscanError";
  }
}

interface Envelope {
  status?: string;
  result?: unknown;
  message?: string;
  jsonrpc?: string;
  error?: { code?: number; message?: string };
}

export function createEtherscanClient(opts: {
  apiKey: string;
  baseUrl: string;
  chainId?: number;
  fetchImpl?: typeof fetch;
  spacingMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
  cacheDir?: string;
}): { call(params: Record<string, string | number>): Promise<unknown> } {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep =
    opts.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const spacingMs = opts.spacingMs ?? 250;
  const chainId = opts.chainId ?? 1;

  const cachePath = (params: Record<string, string | number>): string | null =>
    opts.cacheDir && isImmutableCall(params)
      ? join(opts.cacheDir, String(chainId), `${cacheKey(chainId, params)}.json`)
      : null;


  const attempt = async (
    params: Record<string, string | number>,
  ): Promise<unknown> => {
    const url = new URL(opts.baseUrl);
    // The V2 endpoint routes by chainid on every call; without it every
    // answer is `NOTOK / Missing Or invalid Action name`.
    url.searchParams.set("chainid", String(chainId));
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
    url.searchParams.set("apikey", opts.apiKey);
    let lastError: EtherscanError | undefined;
    for (let tryNo = 0; tryNo <= RETRY_DELAYS_MS.length; tryNo += 1) {
      if (tryNo > 0) {
        await sleep(RETRY_DELAYS_MS[tryNo - 1]);
      }
      let response: Response;
      try {
        response = await doFetch(url, { signal: AbortSignal.timeout(30_000) });
      } catch {
        lastError = new EtherscanError(
          "Etherscan did not answer in time.",
          "transient",
        );
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        lastError = new EtherscanError(
          `Etherscan answered HTTP ${response.status}; backing off.`,
          "transient",
        );
        continue;
      }
      let envelope: Envelope;
      try {
        envelope = (await response.json()) as Envelope;
      } catch {
        lastError = new EtherscanError(
          "Etherscan answered with a non-JSON body.",
          "transient",
        );
        continue;
      }
      const message = (envelope.message ?? "").trim();
      if (envelope.status === "1") {
        return envelope.result;
      }
      // proxy-module calls answer bare JSON-RPC: no status field at all.
      // An `error` member is the only failure shape it has.
      if (envelope.jsonrpc !== undefined) {
        const rpcError = envelope.error;
        if (rpcError === undefined && envelope.result !== undefined) {
          return envelope.result;
        }
        const rpcMessage = rpcError?.message ?? "";
        if (/rate.?limit/i.test(rpcMessage)) {
          lastError = new EtherscanError(
            "Etherscan rate limit reached; backing off.",
            "transient",
          );
          continue;
        }
        throw new EtherscanError(
          `Etherscan answered with a JSON-RPC error: ${rpcMessage || "no message"}`,
          "unavailable",
        );
      }
      // An empty page answers status "0" with an empty array and a
      // message like "No transactions found" - that is data, not an
      // error, and the most common answer a full backfill gives.
      if (Array.isArray(envelope.result) && envelope.result.length === 0) {
        return envelope.result;
      }
      const resultText =
        typeof envelope.result === "string" ? envelope.result : "";
      if (
        /rate.?limit/i.test(message) ||
        /rate.?limit/i.test(resultText) ||
        message.toLowerCase().includes("too many")
      ) {
        lastError = new EtherscanError(
          "Etherscan rate limit reached; backing off.",
          "transient",
        );
        continue;
      }
      if (/invalid api key|missing api key|api key is not/i.test(message)) {
        throw new EtherscanError(
          "Etherscan rejected the API key - check the key on the ethereum connection.",
          "auth",
        );
      }
      if (
        /not available|free api key|plan/i.test(message) ||
        /not available|plan/i.test(resultText)
      ) {
        throw new EtherscanError(
          `Etherscan endpoint not available for this API key's plan: ${message || resultText}`,
          "unavailable",
        );
      }
      throw new EtherscanError(
        `Etherscan answered NOTOK: ${message || resultText || "no message"}`,
        "unavailable",
      );
    }
    throw lastError ?? new EtherscanError("Etherscan call failed.", "transient");
  };

  return {
    async call(params: Record<string, string | number>): Promise<unknown> {
      // Immutable answers out of the walk's path first: a repeated
      // window costs neither the key's throttle nor the pacing wait.
      const file = cachePath(params);
      if (file) {
        try {
          return JSON.parse(await readFile(file, "utf8")) as unknown;
        } catch {
          // A miss - or a cache that cannot be read at all. The walk
          // answers from the API and fills the file back in.
        }
      }
      // Etherscan's rate limit is per key, not per client: backfills on
      // several chains run concurrently in this process, so every client
      // for the same key shares one gate.
      const key = opts.apiKey;
      const run = (keyGates.get(key) ?? Promise.resolve()).then(async () => {
        await sleep(spacingMs);
        return attempt(params);
      });
      // Keep the gate alive even when a call rejects, so one failed call
      // never poisons the calls queued behind it.
      keyGates.set(
        key,
        run.then(
          () => undefined,
          () => undefined,
        ),
      );
      const value = await run;
      if (file && value !== undefined && value !== null) {
        try {
          await mkdir(join(opts.cacheDir as string, String(chainId)), {
            recursive: true,
          });
          await writeFile(file, JSON.stringify(value));
        } catch {
          // A cache that cannot be written is a cache miss tomorrow,
          // never a failed walk today.
        }
      }
      return value;
    },
  };
}

/** The head block, via the proxy module (same V2 endpoint). */
export async function etherscanHeadBlock(client: {
  call(params: Record<string, string | number>): Promise<unknown>;
}): Promise<number> {
  const result = await client.call({
    module: "proxy",
    action: "eth_blockNumber",
  });
  if (typeof result !== "string") {
    throw new EtherscanError(
      "Etherscan did not answer eth_blockNumber.",
      "transient",
    );
  }
  return Number.parseInt(result, 16);
}

/**
 * One address's rows for a block window, ascending, paged until a short
 * page. 50 pages is the ceiling: 500k rows for one address in one
 * window means the caller must shrink `windowBlocks`, not the API.
 */
export async function fetchWindow(
  client: {
    call(params: Record<string, string | number>): Promise<unknown>;
  },
  params: {
    address: string;
    action: string;
    startBlock: number;
    endBlock: number;
    pageSize?: number;
  },
): Promise<EtherscanRow[]> {
  return (await fetchWindowCapped(client, params)).rows;
}

/**
 * The same paged window, with a hard page ceiling and a `truncated`
 * answer: `true` means the window held more rows than the ceiling
 * covers and the caller must shrink the window (or accept the cut).
 * Unbounded paging is how a walk's worker gets OOM-killed on a busy
 * stretch of history - the ceiling is what keeps a step's memory finite.
 */
export async function fetchWindowCapped(
  client: {
    call(params: Record<string, string | number>): Promise<unknown>;
  },
  params: {
    address: string;
    action: string;
    startBlock: number;
    endBlock: number;
    pageSize?: number;
    maxPages?: number;
  },
): Promise<{ rows: EtherscanRow[]; truncated: boolean }> {
  const pageSize = params.pageSize ?? 10_000;
  const maxPages = params.maxPages ?? 50;
  const rows: EtherscanRow[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = (await client.call({
      module: "account",
      action: params.action,
      address: params.address,
      startblock: params.startBlock,
      endblock: params.endBlock,
      page,
      offset: pageSize,
      sort: "asc",
    })) as EtherscanRow[] | null;
    const list = Array.isArray(batch) ? batch : [];
    rows.push(...list);
    if (list.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** Parse an Etherscan counter: the standard endpoints answer decimal, the
 * proxy module hex. */
export function parseCount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    return value.toLowerCase().startsWith("0x")
      ? Number.parseInt(value, 16)
      : Number.parseInt(value, 10);
  }
  return 0;
}

/** A log as the `logs` module answers it, narrowed for decoding. */
export interface EtherscanLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  transactionHash: string;
}

type RawLog = Record<string, unknown>;

/** String fields from a raw Etherscan object; anything else falls back. */
function asText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Logs of any of `addresses` in one block window. The endpoint takes at
 * most 20 comma-joined addresses per call and caps a page at 1000 entries;
 * `truncated` says a chunk hit the page ceiling, so the caller can shrink
 * the window rather than silently import a partial hit list.
 *
 * Ruling: the proxy module has no eth_getLogs - only `module=logs` answers.
 */
export async function getLogs(
  client: {
    call(params: Record<string, string | number>): Promise<unknown>;
  },
  params: {
    addresses: string[];
    startBlock: number;
    endBlock: number;
    maxPages?: number;
  },
): Promise<{ logs: EtherscanLog[]; truncated: boolean }> {
  const maxPages = params.maxPages ?? 10;
  const logs: EtherscanLog[] = [];
  let truncated = false;
  for (let start = 0; start < params.addresses.length; start += 20) {
    const csv = params.addresses.slice(start, start + 20).join(",");
    for (let page = 1; page <= maxPages; page += 1) {
      const batch = (await client.call({
        module: "logs",
        action: "getLogs",
        address: csv,
        startblock: params.startBlock,
        endblock: params.endBlock,
        page,
        offset: 1000,
        sort: "asc",
      })) as RawLog[] | null;
      const list = Array.isArray(batch) ? batch : [];
      for (const raw of list) {
        logs.push({
          address: asText(raw.address, ""),
          topics: Array.isArray(raw.topics) ? (raw.topics as string[]) : [],
          data: asText(raw.data, "0x"),
          logIndex: parseCount(raw.logIndex),
          transactionHash: asText(raw.transactionHash, ""),
        });
      }
      if (list.length < 1000) break;
      if (page === maxPages) truncated = true;
    }
  }
  return { logs, truncated };
}

/** A mined receipt narrowed to what the decode engine reads. */
export interface EtherscanReceipt {
  hash: string;
  to: string | null;
  value: string;
  blockNumber: number;
  logs: {
    address: string;
    topics: string[];
    data: string;
    logIndex: number;
  }[];
}

/** The receipt of one transaction; null when the hash mined nothing (a
 * replaced tx) - the caller drops it from the hit list. */
export async function getTransactionReceipt(
  client: {
    call(params: Record<string, string | number>): Promise<unknown>;
  },
  hash: string,
): Promise<EtherscanReceipt | null> {
  const raw = (await client.call({
    module: "proxy",
    action: "eth_getTransactionReceipt",
    txhash: hash,
  })) as RawLog | null;
  if (!raw || typeof raw !== "object") return null;
  return {
    hash,
    to: typeof raw.to === "string" ? raw.to : null,
    value: typeof raw.value === "string" ? raw.value : "0x0",
    blockNumber: parseCount(raw.blockNumber),
    logs: Array.isArray(raw.logs)
      ? (raw.logs as RawLog[]).map((log) => ({
          address: asText(log.address, ""),
          topics: Array.isArray(log.topics) ? (log.topics as string[]) : [],
          data: asText(log.data, "0x"),
          logIndex: parseCount(log.logIndex),
        }))
      : [],
  };
}

/** The native value a transaction carried; receipts do not report it and
 * ENS-style fees ride on it. */
export async function getTransactionValue(
  client: {
    call(params: Record<string, string | number>): Promise<unknown>;
  },
  hash: string,
): Promise<string> {
  const raw = (await client.call({
    module: "proxy",
    action: "eth_getTransactionByHash",
    txhash: hash,
  })) as RawLog | null;
  return typeof raw?.value === "string" ? raw.value : "0x0";
}

/** An ISO timestamp for a block number, via the proxy. */
export async function getBlockTimestamp(
  client: {
    call(params: Record<string, string | number>): Promise<unknown>;
  },
  blockNumber: number,
): Promise<string> {
  const raw = (await client.call({
    module: "proxy",
    action: "eth_getBlockByNumber",
    tag: `0x${blockNumber.toString(16)}`,
    boolean: "false",
  })) as RawLog | null;
  return new Date(parseCount(raw?.timestamp) * 1000).toISOString();
}
