/**
 * Blockscout live round: everything this address did since the wallet's
 * scan cursor, newest-first pages until below the cursor, plus the
 * current native balance. Blockscout answers from its indexed head;
 * the confirmation margin is whatever Blockscout itself treats as
 * canonical (it only lists included transactions).
 */
import { createAction, Property } from "@powerhousedao/pieces-framework";
import { blockscoutConfig, ethereumAuth } from "../auth.js";
import { authProps } from "../client.js";
import { globalState } from "../reactor.js";
import { createBlockscoutClient, type BlockscoutPage } from "../blockscout.js";
import { mapBlockscoutRows } from "../blockscout-rows.js";
import { providerForChain, unsupportedChainMessage } from "../providers.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";
import type { LedgerEventRow } from "../etherscan-rows.js";

export type BlockscoutClient = {
  getPage(
    path: string,
    params?: Record<string, string | number> | null,
  ): Promise<BlockscoutPage>;
  getObject(path: string): Promise<Record<string, unknown>>;
};

function blockOf(item: Record<string, unknown>): number {
  const value = item.block_number;
  return typeof value === "number" ? value : Number(value ?? 0) || 0;
}

async function collectNewer(
  client: BlockscoutClient,
  address: string,
  endpoint: string,
  fromBlock: number,
  maxPages: number,
): Promise<{ items: Record<string, unknown>[]; headBlock: number }> {
  const fresh: Record<string, unknown>[] = [];
  let params: Record<string, string | number> | null = null;
  let headBlock = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const answer = await client.getPage(`/addresses/${address}/${endpoint}`, params);
    for (const item of answer.items) {
      const block = blockOf(item);
      headBlock = Math.max(headBlock, block);
      if (block >= fromBlock) fresh.push(item);
    }
    const oldestOnPage = answer.items.reduce(
      (min, item) => Math.min(min, blockOf(item)),
      Number.POSITIVE_INFINITY,
    );
    params = answer.nextPageParams;
    if (params === null || oldestOnPage < fromBlock) break;
  }
  return { items: fresh, headBlock };
}

export async function fetchBlockscoutRecent(
  client: BlockscoutClient,
  address: string,
  chainId: number,
  opts: { fromBlock: number; maxPages: number },
): Promise<{
  rows: LedgerEventRow[];
  balanceWei: string;
  lastBlock: number;
  skippedCategories: string[];
}> {
  const txs = await collectNewer(client, address, "transactions", opts.fromBlock, opts.maxPages);
  const internal = await collectNewer(
    client,
    address,
    "internal-transactions",
    opts.fromBlock,
    opts.maxPages,
  );
  const transfers = await collectNewer(
    client,
    address,
    "token-transfers",
    opts.fromBlock,
    opts.maxPages,
  );
  const addressInfo = await client.getObject(`/addresses/${address}`);
  const balance = addressInfo.coin_balance;
  const { events } = mapBlockscoutRows(chainId, address, {
    txs: txs.items,
    internal: internal.items,
    transfers: transfers.items.filter((item) => {
      const type = typeof item.type === "string" ? item.type : "";
      return type === "" || type === "ERC-20";
    }),
  });
  const head = Math.max(txs.headBlock, internal.headBlock, transfers.headBlock);
  return {
    rows: events,
    balanceWei: typeof balance === "string" ? balance : "0",
    lastBlock: Math.max(opts.fromBlock - 1, head),
    skippedCategories: [],
  };
}

export const ethereumFetchBlockscoutRecentAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  name: "fetch-blockscout-recent",
  displayName: "Fetch Blockscout Recent",
  description:
    "Poll one Blockscout-served chain (OP Mainnet, Gnosis) for everything this address did since the wallet's scan cursor, plus its native balance.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description: "The stackfolio/wallet-account document to poll.",
      required: true,
    }),
    fromBlock: Property.Number({
      displayName: "From block (override)",
      description:
        "Leave empty to poll from the document's cursor (the normal wiring).",
      required: false,
    }),
    maxPages: Property.Number({
      displayName: "Max pages per endpoint",
      description: "Ceiling on pages per endpoint. Default 20.",
      required: false,
      defaultValue: 20,
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
      cursor: { lastNativeScanBlock: number | null } | null;
    }>(document);
    const address = global.address ?? "";
    if (address === "") {
      throw new Error(
        `Document ${documentId} has no address yet - set the account details before polling.`,
      );
    }
    const chainId = global.chainId ?? 1;
    if (providerForChain(chainId) === null) {
      throw new Error(unsupportedChainMessage(chainId));
    }
    const client = createBlockscoutClient({ apiKey: auth.apiKey, chainId });
    const cursorBlock = global.cursor?.lastNativeScanBlock;
    const fromBlock =
      props.fromBlock ??
      (cursorBlock === null || cursorBlock === undefined ? 0 : cursorBlock + 1);
    return fetchBlockscoutRecent(client, address, chainId, {
      fromBlock,
      maxPages: props.maxPages ?? 20,
    });
  },
});
