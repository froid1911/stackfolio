/**
 * The Ankr live round: everything since the wallet's scan cursor,
 * walked as one ascending range (the same call discipline as the
 * history walk, one window only), plus the current native balance read
 * straight off Ankr's chain RPC. Never answers below the cursor, so
 * quiet rounds no-op without tripping the import's regression guard.
 */
import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ankrConfig, ethereumAuth } from "../auth.js";
import { authProps } from "../client.js";
import { globalState } from "../reactor.js";
import { ankrChainName, createAnkrClient, type AnkrClient } from "../ankr.js";
import { mapAnkrRows } from "../ankr-rows.js";
import { providerForChain, unsupportedChainMessage } from "../providers.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";
import { ankrHeadBlock } from "./fetch-ankr-history.js";
import type { LedgerEventRow } from "../etherscan-rows.js";

export async function fetchAnkrRecent(
  client: AnkrClient,
  opts: {
    chain: string;
    chainId: number;
    address: string;
    fromBlock: number;
    safeHead: number;
  },
): Promise<{
  rows: LedgerEventRow[];
  balanceWei: string;
  lastBlock: number;
  skippedCategories: string[];
}> {
  const rows: LedgerEventRow[] = [];
  if (opts.safeHead >= opts.fromBlock) {
    let token: string | null = null;
    for (;;) {
      const page = await client.transactions({
        chain: opts.chain,
        address: opts.address,
        fromBlock: opts.fromBlock,
        toBlock: opts.safeHead,
        pageToken: token,
        includeLogs: true,
      });
      rows.push(...mapAnkrRows(opts.chainId, opts.address, page).events);
      token = page.nextPageToken;
      if (token === null) break;
    }
  }
  const balanceRaw = (await client.rpc(opts.chain, "eth_getBalance", [
    opts.address,
    "latest",
  ])) as string;
  return {
    rows,
    balanceWei: hexOrZero(balanceRaw),
    // Never answer below the cursor: an empty round keeps the cursor.
    lastBlock: Math.max(opts.fromBlock - 1, opts.safeHead),
    skippedCategories: ["internal"],
  };
}

function hexOrZero(value: unknown): string {
  if (typeof value !== "string") return "0";
  try {
    return BigInt(value).toString();
  } catch {
    return "0";
  }
}

export const ethereumFetchAnkrRecentAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  name: "fetch-ankr-recent",
  displayName: "Fetch Ankr Recent",
  description:
    "The live round from the Ankr multichain API (Base, BSC, Avalanche): native and ERC-20 transfers since the wallet's cursor, plus the current native balance over Ankr's chain RPC.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description: "The stackfolio/wallet-account document to poll.",
      required: true,
    }),
    confirmations: Property.Number({
      displayName: "Confirmations",
      description: "Only import blocks this far behind the head. Default 30.",
      required: false,
      defaultValue: 30,
    }),
  },
  async run(context) {
    const auth = ankrConfig(authProps(context.auth));
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
    const provider = providerForChain(chainId);
    if (provider !== "ankr") {
      throw new Error(
        provider === null
          ? unsupportedChainMessage(chainId)
          : `Chain ${chainId} is imported through ${provider}, not Ankr.`,
      );
    }
    const chain = ankrChainName(chainId);
    const client = createAnkrClient({ apiKey: auth.apiKey });
    const head = await ankrHeadBlock(client, chain, address);
    const safeHead = Math.max(head - (props.confirmations ?? 30), 0);
    const cursorBlock = global.cursor?.lastNativeScanBlock;
    const fromBlock =
      cursorBlock === null || cursorBlock === undefined ? 0 : cursorBlock + 1;
    return fetchAnkrRecent(client, {
      chain,
      chainId,
      address,
      fromBlock,
      safeHead,
    });
  },
});
