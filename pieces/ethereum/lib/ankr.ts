/**
 * The Ankr Advanced API client: one JSON-RPC endpoint behind one key,
 * answering the chains neither Etherscan's free plan nor the Blockscout
 * plan covers (Base, BNB Smart Chain, Avalanche C-Chain). History comes
 * from `ankr_getTransactionsByAddress` scoped by block range with an
 * opaque `pageToken` continuation - the only pagination Ankr answers
 * (pageNumber is ignored, verified live); `includeLogs` embeds each
 * transaction's log array, so ERC-20 transfers ride along for free.
 * Head and balance come from Ankr's per-chain RPC endpoint - plain
 * `eth_blockNumber` / `eth_getBalance` behind the same key.
 */
import { gated as keyGate, RETRY_DELAYS_MS } from "./gate.js";

export class AnkrError extends Error {
  constructor(
    message: string,
    readonly category: "transient" | "auth" | "unavailable",
  ) {
    super(message);
    this.name = "AnkrError";
  }
}

export const ANKR_MULTICHAIN_BASE = "https://rpc.ankr.com/multichain";
export const ANKR_RPC_BASE = "https://rpc.ankr.com";

/** Ankr's lowercase chain slugs for the chains it fills our gaps. */
export const ANKR_CHAIN_NAME: Record<number, string> = {
  8453: "base",
  56: "bsc",
  43114: "avalanche",
};

export function ankrChainName(chainId: number): string {
  const name = ANKR_CHAIN_NAME[chainId];
  if (name === undefined) {
    throw new AnkrError(
      `Chain ${chainId} is not on Ankr's multichain roster (Base, BSC, Avalanche).`,
      "unavailable",
    );
  }
  return name;
}

export interface AnkrLog {
  address: string;
  topics: string[];
  data: string;
  removed?: boolean | null;
}

export interface AnkrTx {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  blockNumber: string;
  timestamp: string;
  gasUsed: string;
  gasPrice: string;
  status: string;
  logs?: AnkrLog[] | null;
}

export interface AnkrTxPage {
  txs: AnkrTx[];
  nextPageToken: string | null;
  /** Ankr's own sync head, when the answer carries syncStatus. */
  headBlock: number | null;
}

export type AnkrClient = {
  transactions(opts: {
    chain: string;
    address: string;
    fromBlock?: number;
    toBlock?: number;
    pageToken?: string | null;
    includeLogs?: boolean;
    pageSize?: number;
  }): Promise<AnkrTxPage>;
  rpc(chain: string, method: string, params: unknown[]): Promise<unknown>;
};

type JsonRpcError = { code?: number; message?: string };

function classify(
  httpStatus: number,
  rpcError: JsonRpcError | undefined,
): AnkrError {
  if (rpcError !== undefined) {
    const message = rpcError.message ?? "unknown error";
    // -32075: plan restriction. -32601: method not served. Both are
    // operator facts, not retryable weather.
    if (rpcError.code === -32075) {
      return new AnkrError(
        `Ankr's plan for this key does not allow the call: ${message}`,
        "unavailable",
      );
    }
    if (rpcError.code === -32601 || rpcError.code === -32602) {
      return new AnkrError(`Ankr refused the call: ${message}`, "unavailable");
    }
    return new AnkrError(
      `Ankr answered with an error (${rpcError.code}): ${message}`,
      "transient",
    );
  }
  return new AnkrError(
    `Ankr answered HTTP ${httpStatus}.`,
    httpStatus >= 500 ? "transient" : "unavailable",
  );
}

export function createAnkrClient(opts: {
  apiKey: string;
  multichainBaseUrl?: string;
  rpcBaseUrl?: string;
  fetchImpl?: typeof fetch;
  spacingMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): AnkrClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep =
    opts.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  // Freemium keys answer slower and grader than Etherscan's 5/s; a
  // generous spacing keeps the shared gate under the plan's ceiling.
  const spacingMs = opts.spacingMs ?? 400;
  const multichain =
    opts.multichainBaseUrl ?? `${ANKR_MULTICHAIN_BASE}/${opts.apiKey}`;
  const rpcBase = opts.rpcBaseUrl ?? ANKR_RPC_BASE;

  const post = async (url: string, body: string): Promise<unknown> => {
    let lastError: AnkrError | undefined;
    for (let tryNo = 0; tryNo <= RETRY_DELAYS_MS.length; tryNo += 1) {
      if (tryNo > 0) {
        await sleep(RETRY_DELAYS_MS[tryNo - 1]);
      }
      let response: Response;
      try {
        response = await doFetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        lastError = new AnkrError("Ankr did not answer in time.", "transient");
        continue;
      }
      if (response.status === 429) {
        lastError = new AnkrError(
          "Ankr rate limit reached; backing off.",
          "transient",
        );
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new AnkrError(
          "Ankr rejected the key - set ankrApiKey on the ethereum connection.",
          "auth",
        );
      }
      let payload: { result?: unknown; error?: JsonRpcError };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        lastError = new AnkrError(
          "Ankr answered with a non-JSON body.",
          "transient",
        );
        continue;
      }
      if (payload.error !== undefined && payload.error !== null) {
        const error = classify(response.status, payload.error);
        if (error.category === "transient") {
          lastError = error;
          continue;
        }
        throw error;
      }
      if (response.status >= 500) {
        lastError = new AnkrError(
          `Ankr answered HTTP ${response.status}; backing off.`,
          "transient",
        );
        continue;
      }
      return payload.result;
    }
    throw lastError ?? new AnkrError("Ankr call failed.", "transient");
  };

  const gated = <T>(run: () => Promise<T>): Promise<T> => {
    // One gate per key across every chain and endpoint, like the others.
    return keyGate(`ankr:${opts.apiKey}`, "bulk", async () => {
      await sleep(spacingMs);
      return run();
    });
  };

  return {
    async transactions(txOpts) {
      const params: Record<string, unknown> = {
        blockchain: [txOpts.chain],
        address: txOpts.address,
        pageSize: txOpts.pageSize ?? 10_000,
        includeLogs: txOpts.includeLogs ?? false,
      };
      if (txOpts.fromBlock !== undefined) {
        params.fromBlock = txOpts.fromBlock;
      }
      if (txOpts.toBlock !== undefined) {
        params.toBlock = txOpts.toBlock;
      }
      if (txOpts.pageToken) {
        params.pageToken = txOpts.pageToken;
      }
      const result = (await gated(() =>
        post(
          multichain,
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "ankr_getTransactionsByAddress",
            params: [params],
          }),
        ),
      )) as {
        transactions?: unknown;
        nextPageToken?: unknown;
        syncStatus?: { blockNumber?: string } | null;
      };
      const syncHead = result.syncStatus?.blockNumber;
      return {
        txs: Array.isArray(result.transactions)
          ? (result.transactions as AnkrTx[])
          : [],
        nextPageToken:
          typeof result.nextPageToken === "string" &&
          result.nextPageToken !== ""
            ? result.nextPageToken
            : null,
        headBlock:
          typeof syncHead === "string" || typeof syncHead === "number"
            ? Number(BigInt(syncHead))
            : null,
      };
    },
    rpc(chain, method, params) {
      return gated(() =>
        post(
          `${rpcBase}/${chain}/${opts.apiKey}`,
          JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        ),
      );
    },
  };
}
