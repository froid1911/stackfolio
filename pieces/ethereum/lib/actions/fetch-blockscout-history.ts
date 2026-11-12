/**
 * Blockscout history: the address's whole ledger, crawled newest-first
 * inside the run's budget. The API offers no block or date filters -
 * every answer is the newest-first cursor crawl - so `done` means the
 * crawl reached the address's oldest page, and the cursor answers the
 * OLDEST block imported (a descending counterpart to Etherscan's
 * ascending cursor). Rows re-seen are re-imported and deduplicated by
 * hash, so a rerun is cheap and a resumed run loses nothing.
 */
import { createAction, Property } from "@powerhousedao/pieces-framework";
import { blockscoutConfig, ethereumAuth } from "../auth.js";
import { authProps } from "../client.js";
import { globalState } from "../reactor.js";
import {
  createBlockscoutClient,
  type BlockscoutPage,
} from "../blockscout.js";
import { mapBlockscoutRows } from "../blockscout-rows.js";
import { providerForChain, unsupportedChainMessage } from "../providers.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";
import type { LedgerEventRow } from "../etherscan-rows.js";

export type BlockscoutClient = {
  getPage(
    path: string,
    params?: Record<string, string | number> | null,
  ): Promise<BlockscoutPage>;
};

function blockOf(item: Record<string, unknown>): number {
  const value = item.block_number;
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

/**
 * One descending crawl of an endpoint, collecting items until the last
 * page, the page budget or the time budget runs out. Reports the oldest
 * block seen and whether the crawl finished.
 */
export async function crawlAddressEndpoint(
  client: BlockscoutClient,
  address: string,
  endpoint: string,
  opts: {
    budgetMs: number;
    maxPages: number;
    /** Ceiling on collected raw items; heavy payloads must not OOM a worker. */
    maxItems?: number;
    now?: () => number;
  },
): Promise<{ items: Record<string, unknown>[]; done: boolean; oldestBlock: number }> {
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const items: Record<string, unknown>[] = [];
  let params: Record<string, string | number> | null = null;
  let done = false;
  for (let page = 0; page < opts.maxPages; page += 1) {
    const answer = await client.getPage(`/addresses/${address}/${endpoint}`, params);
    items.push(...answer.items);
    params = answer.nextPageParams;
    if (params === null) {
      done = true;
      break;
    }
    if (
      now() - startedAt >= opts.budgetMs ||
      (opts.maxItems !== undefined && items.length >= opts.maxItems)
    ) {
      break;
    }
  }
  let oldestBlock = Number.POSITIVE_INFINITY;
  for (const item of items) oldestBlock = Math.min(oldestBlock, blockOf(item));
  // No items carries no information about the oldest block: answer
  // Infinity so the cursor survives an empty or budget-starved crawl.
  return { items, done, oldestBlock };
}

export async function fetchBlockscoutHistory(
  client: BlockscoutClient,
  opts: {
    address: string;
    chainId: number;
    /** Oldest block imported so far; Infinity (or unset) = nothing yet. */
    importedDownTo: number;
    budgetMs: number;
    maxPages: number;
    maxItems?: number;
    now?: () => number;
  },
): Promise<{
  rows: LedgerEventRow[];
  nextBlock: number;
  done: boolean;
  skippedCategories: string[];
}> {
  if (opts.importedDownTo <= 0) {
    // Genesis reached on an earlier run: nothing left to crawl.
    return { rows: [], nextBlock: 0, done: true, skippedCategories: [] };
  }
  const txs = await crawlAddressEndpoint(client, opts.address, "transactions", opts);
  const internal = await crawlAddressEndpoint(
    client,
    opts.address,
    "internal-transactions",
    opts,
  );
  const transfers = await crawlAddressEndpoint(
    client,
    opts.address,
    "token-transfers",
    opts,
  );
  const { events } = mapBlockscoutRows(opts.chainId, opts.address, {
    txs: txs.items,
    internal: internal.items,
    transfers: transfers.items.filter((item) => {
      const type = typeof item.type === "string" ? item.type : "";
      return type === "" || type === "ERC-20";
    }),
  });
  const oldest = Math.min(txs.oldestBlock, internal.oldestBlock, transfers.oldestBlock);
  const finished = txs.done && internal.done && transfers.done;
  const nextBlock = finished ? 0 : Math.min(oldest, opts.importedDownTo);
  return {
    rows: events,
    nextBlock,
    done: finished,
    skippedCategories: [],
  };
}

export const ethereumFetchBlockscoutHistoryAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  name: "fetch-blockscout-history",
  displayName: "Fetch Blockscout History",
  description:
    "Walk a chain's complete history for one address through the Blockscout gateway (OP Mainnet, Gnosis - the chains Etherscan's free plan charges for) as ledger rows, crawling newest-first until the oldest page or the walk budget. Rows are keyed by transaction hash, so overlapping runs are no-ops.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description:
        "The stackfolio/wallet-account document whose address and chain drive the import.",
      required: true,
    }),
    budgetMs: Property.Number({
      displayName: "Walk budget (ms)",
      description: "Stop crawling after this much wall-clock time. Default 240000.",
      required: false,
      defaultValue: 240_000,
    }),
    maxPages: Property.Number({
      displayName: "Max pages per endpoint",
      description: "Ceiling on Blockscout pages per crawl. Default 200.",
      required: false,
      defaultValue: 200,
    }),
    maxItems: Property.Number({
      displayName: "Max items per endpoint",
      description:
        "Stop a crawl after this many raw items; the next run continues. Default 10000.",
      required: false,
      defaultValue: 10_000,
    }),
  },
  async run(context) {
    const auth = blockscoutConfig(authProps(context.auth));
    const props = context.propsValue;
    const documentId = props.accountDocumentId.trim();
    const document = await context.reactor.get(documentId);
    if (document.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(
        `Document ${documentId} is a ${document.header.documentType}, not a ${WALLET_ACCOUNT_TYPE}.`,
      );
    }
    const global = globalState<{
      address: string;
      chainId: number | null;
      backfill: { nextBlock: number | null } | null;
    }>(document);
    const address = global.address ?? "";
    if (address === "") {
      throw new Error(
        `Document ${documentId} has no address yet - set the account details before importing.`,
      );
    }
    const chainId = global.chainId ?? 1;
    if (providerForChain(chainId) === null) {
      throw new Error(unsupportedChainMessage(chainId));
    }
    const client = createBlockscoutClient({ apiKey: auth.apiKey, chainId });
    const cursor = global.backfill?.nextBlock;
    // The descending cursor: null (never imported) or a positive block
    // means crawl on; 0 was answered only by a finished crawl.
    const importedDownTo = cursor === null || cursor === undefined ? Number.POSITIVE_INFINITY : cursor;
    return fetchBlockscoutHistory(client, {
      address,
      chainId,
      importedDownTo,
      budgetMs: props.budgetMs ?? 240_000,
      maxPages: props.maxPages ?? 200,
      maxItems: props.maxItems ?? 10_000,
    });
  },
});
