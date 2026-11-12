import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ethereumAuth, etherscanConfig } from "../auth.js";
import { authProps } from "../client.js";
import { globalState } from "../reactor.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";
import {
  createEtherscanClient,
  etherscanHeadBlock,
  EtherscanError,
  fetchWindow,
  type EtherscanRow,
} from "../etherscan.js";
import { mapEtherscanRows } from "../etherscan-rows.js";
import { fetchDecodedRows, mergeDecoded } from "../decoded-import.js";
import { registryIndexFor } from "../registry.js";
import type { ChainIndex } from "../manifest.js";
import type { EventRow } from "../types.js";

export type RecentClient = {
  call(params: Record<string, string | number>): Promise<unknown>;
};

/**
 * The live round: everything that happened to the address since the
 * cursor, plus its current balance. Never moves the block cursor back -
 * an empty window answers the previous block - so the import action's
 * regression guard never fires on a quiet minute.
 */
export async function fetchEtherscanRecent(
  client: RecentClient,
  opts: {
    address: string;
    chainId: number;
    fromBlock: number;
    confirmations: number;
    pageSize: number;
    /** Blocks per poll - a laggard cursor climbs toward the head in
     * bounded steps instead of paging a chain-span window into memory.
     * Default 100000. */
    maxBlocks?: number;
    /** Registry contracts to scan; decoded txs replace their generic rows. */
    decode?: { index: ChainIndex };
  },
): Promise<{
  rows: EventRow[];
  balanceWei: string;
  lastBlock: number;
  skippedCategories: string[];
}> {
  const head = await etherscanHeadBlock(client);
  const safeHead = head - opts.confirmations;
  const toBlock = Math.min(
    safeHead,
    opts.fromBlock + (opts.maxBlocks ?? 100_000) - 1,
  );
  const skippedCategories: string[] = [];
  const grab = async (
    category: string,
    action: string,
  ): Promise<EtherscanRow[]> => {
    if (opts.fromBlock > toBlock) return [];
    try {
      return await fetchWindow(client, {
        address: opts.address,
        action,
        startBlock: opts.fromBlock,
        endBlock: toBlock,
        pageSize: opts.pageSize,
      });
    } catch (error) {
      if (error instanceof EtherscanError && error.category === "unavailable") {
        skippedCategories.push(category);
        return [];
      }
      throw error;
    }
  };
  const txs = await grab("transactions", "txlist");
  const internal = await grab("internal", "txlistinternal");
  const tokentxs = await grab("tokens", "tokentx");
  const balanceRaw = (await client.call({
    module: "account",
    action: "balance",
    address: opts.address,
    tag: "latest",
  })) as string;
  const { events } = mapEtherscanRows(opts.chainId, opts.address, {
    txs,
    internal,
    tokentxs,
  });
  const generic: EventRow[] = events.map((event) => ({
    ...event,
    notes: event.notes ?? null,
  }));
  let rows = generic;
  if (opts.decode) {
    const stamps = new Map(generic.map((r) => [r.eventIdentifier, r.timestamp]));
    const decoded = await fetchDecodedRows(client, {
      index: opts.decode.index,
      chainId: opts.chainId,
      account: opts.address,
      startBlock: opts.fromBlock,
      endBlock: toBlock,
      timestampOf: (hash) => stamps.get(hash),
    });
    if (decoded.overflow || decoded.logsTruncated) {
      skippedCategories.push("decoded-overflow");
    }
    rows = mergeDecoded(generic, decoded);
  }
  return {
    rows,
    balanceWei: (BigInt(balanceRaw)).toString(),
    lastBlock: Math.max(opts.fromBlock - 1, safeHead),
    skippedCategories,
  };
}

export const ethereumFetchEtherscanRecentAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  name: "fetch-etherscan-recent",
  displayName: "Fetch Etherscan Recent",
  description:
    "The live round from the Etherscan V2 API: transfers, internal moves and token rows since the cursor, plus the current native balance. Confirmed blocks only; the answered block never goes backwards.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description: "The stackfolio/wallet-account document to poll.",
      required: true,
    }),
    fromBlock: Property.Number({
      displayName: "From block (override)",
      description:
        "Leave empty to poll from the document's cursor + 1 (the normal wiring).",
      required: false,
    }),
    confirmations: Property.Number({
      displayName: "Confirmations",
      description: "Only import blocks this far behind the head. Default 9.",
      required: false,
      defaultValue: 9,
    }),
    pageSize: Property.Number({
      displayName: "Page size (rows)",
      description: "Etherscan page size. Default 10000.",
      required: false,
      defaultValue: 10_000,
    }),
    registryDocumentId: Property.ShortText({
      displayName: "Protocol registry document",
      description:
        "Optional stackfolio/protocol-registry document enabling log-aware polling for this window.",
      required: false,
    }),
  },
  async run(context) {
    const auth = etherscanConfig(authProps(context.auth));
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
    const client = createEtherscanClient({
      apiKey: auth.apiKey,
      baseUrl: auth.baseUrl,
      chainId: global.chainId ?? 1,
    });
    const address = global.address ?? "";
    if (address === "") {
      throw new Error(
        `Document ${documentId} has no address yet - set the account details before polling.`,
      );
    }
    const registryId = props.registryDocumentId?.trim();
    let decode: { index: ChainIndex } | undefined;
    if (registryId) {
      try {
        const registryDoc = (await context.reactor.get(registryId)) as {
          header: { documentType: string };
          state: unknown;
        };
        const index = registryIndexFor(registryDoc, global.chainId ?? 1);
        if (index) decode = { index };
      } catch {
        // generic-only poll; enrichment never gates the import
      }
    }
    const cursorBlock = global.cursor?.lastNativeScanBlock;
    const fromBlock =
      props.fromBlock ??
      (cursorBlock === null || cursorBlock === undefined ? 0 : cursorBlock + 1);
    return fetchEtherscanRecent(client, {
      address,
      chainId: global.chainId ?? 1,
      fromBlock,
      confirmations: props.confirmations ?? 9,
      pageSize: props.pageSize ?? 10_000,
      ...(decode ? { decode } : {}),
    });
  },
});
