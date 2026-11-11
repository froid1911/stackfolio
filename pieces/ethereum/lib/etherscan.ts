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

const RETRY_DELAYS_MS = [2_000, 8_000, 32_000];

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
}): { call(params: Record<string, string | number>): Promise<unknown> } {
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep =
    opts.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const spacingMs = opts.spacingMs ?? 220;
  const chainId = opts.chainId ?? 1;
  let queue: Promise<unknown> = Promise.resolve();

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
    call(params: Record<string, string | number>): Promise<unknown> {
      const run = queue.then(async () => {
        await sleep(spacingMs);
        return attempt(params);
      });
      // Keep the chain alive even when an attempt rejects, so one failed
      // call never poisons the queue for the calls behind it.
      queue = run.catch(() => undefined);
      return run;
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
  const pageSize = params.pageSize ?? 10_000;
  const rows: EtherscanRow[] = [];
  for (let page = 1; page <= 50; page += 1) {
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
    if (list.length < pageSize) break;
  }
  return rows;
}
