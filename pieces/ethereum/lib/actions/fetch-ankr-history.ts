/**
 * Ankr history: the address's whole ledger, walked ASCENDING in block
 * windows - the same cursor discipline as the Etherscan walk, because
 * Ankr (unlike Blockscout) filters by range. A window pages through
 * the opaque `pageToken`; the next run resumes at the first block the
 * last run fully imported. Rows are keyed by tx hash, so an overlap
 * across runs is a no-op import. ERC-20s ride in the embedded logs;
 * internal traces do not exist on Ankr, which is stated in the walk's
 * `skippedCategories` rather than discovered later in a view.
 */
import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ankrConfig, ethereumAuth } from "../auth.js";
import { authProps } from "../client.js";
import { globalState } from "../reactor.js";
import {
  ankrChainName,
  createAnkrClient,
  type AnkrClient,
} from "../ankr.js";
import { mapAnkrRows } from "../ankr-rows.js";
import { providerForChain, unsupportedChainMessage } from "../providers.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";
import type { LedgerEventRow } from "../etherscan-rows.js";

/**
 * Walk [startBlock, safeHead] ascending. Stops at the first window
 * boundary past the time or row budget; `done` only when the walk
 * passed safeHead. The answered cursor always names the next block to
 * import - partial windows are never half-counted because rows arrive
 * only for fully answered windows (a budget cut inside a window drops
 * that window's rows).
 */
export async function fetchAnkrHistory(
  client: AnkrClient,
  opts: {
    chain: string;
    chainId: number;
    address: string;
    startBlock: number;
    safeHead: number;
    windowBlocks: number;
    budgetMs: number;
    maxRows: number;
    now?: () => number;
  },
): Promise<{
  rows: LedgerEventRow[];
  nextBlock: number;
  done: boolean;
  skippedCategories: string[];
}> {
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const rows: LedgerEventRow[] = [];
  let block = opts.startBlock;
  let done = false;
  const skippedCategories = ["internal"];
  while (block <= opts.safeHead) {
    const toBlock = Math.min(block + opts.windowBlocks - 1, opts.safeHead);
    let token: string | null = null;
    let windowRows: LedgerEventRow[] = [];
    let windowComplete = false;
    for (;;) {
      const page = await client.transactions({
        chain: opts.chain,
        address: opts.address,
        fromBlock: block,
        toBlock,
        pageToken: token,
        includeLogs: true,
      });
      windowRows.push(...mapAnkrRows(opts.chainId, opts.address, page).events);
      token = page.nextPageToken;
      if (token === null) {
        windowComplete = true;
        break;
      }
      if (
        now() - startedAt >= opts.budgetMs ||
        (opts.maxRows > 0 && rows.length + windowRows.length >= opts.maxRows)
      ) {
        break;
      }
    }
    if (!windowComplete) {
      // Budget cut mid-window: the rows are still worth importing
      // (hash-keyed, idempotent) but the cursor stays at this window's
      // first block so the next run re-covers it whole.
      rows.push(...windowRows);
      break;
    }
    rows.push(...windowRows);
    block = toBlock + 1;
    if (
      now() - startedAt >= opts.budgetMs ||
      (opts.maxRows > 0 && rows.length >= opts.maxRows)
    ) {
      break;
    }
  }
  done = block > opts.safeHead;
  return { rows, nextBlock: block, done, skippedCategories };
}

export async function ankrHeadBlock(
  client: AnkrClient,
  chain: string,
  address: string,
): Promise<number> {
  try {
    const raw = await client.rpc(chain, "eth_blockNumber", []);
    if (typeof raw === "string") return Number(BigInt(raw));
  } catch {
    // Chain RPC down or the slug moved: a pageSize-1 history call
    // answers Ankr's own sync head as well.
  }
  const probe = await client.transactions({
    chain,
    address,
    pageSize: 1,
    fromBlock: 0,
    toBlock: 999_999_999,
  });
  if (probe.headBlock === null) {
    throw new Error("Ankr answered no head block for chain " + chain + ".");
  }
  return probe.headBlock;
}

export const ethereumFetchAnkrHistoryAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  name: "fetch-ankr-history",
  displayName: "Fetch Ankr History",
  description:
    "Walk a chain's complete native+ERC-20 history for one address through the Ankr multichain API (Base, BSC, Avalanche - the chains the other free plans refuse) as ledger rows, ascending from the wallet's backfill cursor. Rows are keyed by transaction hash, so overlapping runs are no-ops. Internal contract traces are not indexed by Ankr and are reported as skipped.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description:
        "The stackfolio/wallet-account document whose address and chain drive the import.",
      required: true,
    }),
    windowBlocks: Property.Number({
      displayName: "Window size (blocks)",
      description: "Blocks per walk step. Default 1000000.",
      required: false,
      defaultValue: 1_000_000,
    }),
    confirmations: Property.Number({
      displayName: "Confirmations",
      description:
        "Only walk blocks this far behind the head. Default 30 (seconds-scale chains).",
      required: false,
      defaultValue: 30,
    }),
    budgetMs: Property.Number({
      displayName: "Walk budget (ms)",
      description: "Stop walking after this much wall-clock time. Default 240000.",
      required: false,
      defaultValue: 240_000,
    }),
    maxRows: Property.Number({
      displayName: "Max rows per run",
      description:
        "Stop at a window boundary after this many collected rows; the next run continues. Default 5000, 0 for no cap.",
      required: false,
      defaultValue: 5_000,
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
      backfill: { nextBlock: number | null } | null;
    }>(document);
    const address = global.address ?? "";
    if (address === "") {
      throw new Error(
        `Document ${documentId} has no address yet - set the account details before importing.`,
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
    const startBlock = global.backfill?.nextBlock ?? 0;
    return fetchAnkrHistory(client, {
      chain,
      chainId,
      address,
      startBlock,
      safeHead,
      windowBlocks: props.windowBlocks ?? 1_000_000,
      budgetMs: props.budgetMs ?? 240_000,
      maxRows: props.maxRows ?? 5_000,
    });
  },
});
