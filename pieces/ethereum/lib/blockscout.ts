/**
 * The Blockscout API v2 client: the second indexer, answering the
 * chains Etherscan's free plan charges for (OP Mainnet, Gnosis).
 * Hosted gateway: https://api.blockscout.com/{chainid}/api/v2 with the
 * operator's key. Address endpoints answer newest-first cursor pages;
 * `next_page_params` is echoed back as query params to walk older.
 * Unlike Etherscan there are no block or date filters - every answer
 * is the whole newest-first crawl - so the import actions treat
 * paging as the walk and lean on hash-keyed import idempotence.
 */
import { keyGates, RETRY_DELAYS_MS } from "./gate.js";

export class BlockscoutError extends Error {
  constructor(
    message: string,
    readonly category: "transient" | "auth" | "unavailable",
  ) {
    super(message);
    this.name = "BlockscoutError";
  }
}

export interface BlockscoutPage {
  items: Record<string, unknown>[];
  nextPageParams: Record<string, string | number> | null;
}

export const BLOCKSCOUT_GATEWAY = "https://api.blockscout.com";

export function blockscoutBaseUrl(chainId: number): string {
  return `${BLOCKSCOUT_GATEWAY}/${chainId}/api/v2`;
}

export function createBlockscoutClient(opts: {
  apiKey: string;
  chainId: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  spacingMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}): {
  getPage(
    path: string,
    params?: Record<string, string | number> | null,
  ): Promise<BlockscoutPage>;
  getObject(path: string): Promise<Record<string, unknown>>;
} {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep =
    opts.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const spacingMs = opts.spacingMs ?? 220;
  const base = opts.baseUrl ?? blockscoutBaseUrl(opts.chainId);

  const attempt = async (
    path: string,
    params: Record<string, string | number> | null,
  ): Promise<Record<string, unknown>> => {
    const url = new URL(`${base}${path}`);
    for (const [name, value] of Object.entries(params ?? {})) {
      url.searchParams.set(name, String(value));
    }
    url.searchParams.set("apikey", opts.apiKey);
    let lastError: BlockscoutError | undefined;
    for (let tryNo = 0; tryNo <= RETRY_DELAYS_MS.length; tryNo += 1) {
      if (tryNo > 0) {
        await sleep(RETRY_DELAYS_MS[tryNo - 1]);
      }
      let response: Response;
      try {
        response = await doFetch(url, { signal: AbortSignal.timeout(30_000) });
      } catch {
        lastError = new BlockscoutError(
          "Blockscout did not answer in time.",
          "transient",
        );
        continue;
      }
      if (response.status === 429) {
        lastError = new BlockscoutError(
          "Blockscout rate limit reached; backing off.",
          "transient",
        );
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new BlockscoutError(
          "Blockscout rejected the API key - set blockscoutApiKey on the ethereum connection.",
          "auth",
        );
      }
      let body: {
        items?: unknown;
        next_page_params?: Record<string, string | number> | null;
        error?: string;
      };
      try {
        body = (await response.json()) as typeof body;
      } catch {
        lastError = new BlockscoutError(
          "Blockscout answered with a non-JSON body.",
          "transient",
        );
        continue;
      }
      if (typeof body.error === "string") {
        if (/too many requests/i.test(body.error)) {
          lastError = new BlockscoutError(
            "Blockscout rate limit reached; backing off.",
            "transient",
          );
          continue;
        }
        if (/network not supported/i.test(body.error)) {
          throw new BlockscoutError(
            `Blockscout does not serve chain ${opts.chainId}.`,
            "unavailable",
          );
        }
        if (/api.?key/i.test(body.error)) {
          throw new BlockscoutError(
            "Blockscout rejected the API key - set blockscoutApiKey on the ethereum connection.",
            "auth",
          );
        }
        if (/plan/i.test(body.error)) {
          throw new BlockscoutError(
            `Blockscout needs a bigger plan for chain ${opts.chainId}: ${body.error}`,
            "unavailable",
          );
        }
        throw new BlockscoutError(
          `Blockscout answered with an error: ${body.error}`,
          "unavailable",
        );
      }
      if (response.status >= 500) {
        lastError = new BlockscoutError(
          `Blockscout answered HTTP ${response.status}; backing off.`,
          "transient",
        );
        continue;
      }
      return body;
    }
    throw lastError ?? new BlockscoutError("Blockscout call failed.", "transient");
  };

  const gated = (path: string, params: Record<string, string | number> | null) => {
    // Meter by key, like Etherscan: one gate per key across all chains.
    const key = `blockscout:${opts.apiKey}`;
    const run = (keyGates.get(key) ?? Promise.resolve()).then(async () => {
      await sleep(spacingMs);
      return attempt(path, params ?? null);
    });
    keyGates.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  };

  return {
    async getPage(path, params) {
      const body = await gated(path, params ?? null);
      return {
        items: Array.isArray(body.items)
          ? (body.items as Record<string, unknown>[])
          : [],
        nextPageParams: (body.next_page_params ?? null) as Record<
          string,
          string | number
        > | null,
      };
    },
    getObject(path) {
      return gated(path, null);
    },
  };
}
