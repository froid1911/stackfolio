/**
 * Bitcoin history: the watch-only wallet's whole ledger, crawled
 * newest-first inside the run's budget. mempool.space answers every
 * address query newest-first with a txid cursor, so `done` means every
 * derived address reached its oldest page, and the cursor answers the
 * OLDEST confirmed height seen (a descending counterpart to Etherscan's
 * ascending cursor; 0 = genesis reached). Rows re-seen are re-imported
 * and deduplicated by txid, so overlapping runs are cheap and a resumed
 * run loses nothing.
 */
import { createAction, Property } from "@powerhousedao/pieces-framework";
import { bitcoinConfig, ethereumAuth } from "../auth.js";
import { authProps } from "../client.js";
import { globalState } from "../reactor.js";
import {
  bitcoinAssetId,
  createBitcoinClient,
  expandTargets,
  isXpub,
  networkOf,
  type BitcoinClient,
  type BitcoinNetwork,
  type BitcoinTarget,
  type BitcoinTx,
} from "../bitcoin.js";
import { mapBitcoinRows } from "../bitcoin-rows.js";
import { BITCOIN_CHAIN_ID } from "../providers.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";
import type { LedgerEventRow } from "../etherscan-rows.js";

/** What the actions need from a wallet-account document (chain 0). */
export interface BitcoinWalletView {
  address?: string;
  chainId?: number | null;
  bitcoinXpub?: string | null;
  cursor?: { lastNativeScanBlock?: number | null } | null;
  backfill?: { nextBlock?: number | null } | null;
}

/**
 * The watch-only target of a chain-0 wallet: its xpub when set, else its
 * address. Throws naming the document when neither exists.
 */
export function bitcoinWalletTarget(
  global: BitcoinWalletView,
  documentId: string,
): string {
  const xpub = (global.bitcoinXpub ?? "").trim();
  if (xpub !== "") return xpub;
  const address = (global.address ?? "").trim();
  if (address !== "") return address;
  throw new Error(
    `Document ${documentId} is a Bitcoin wallet without an xpub or address - set the account details before importing.`,
  );
}

export interface BitcoinWalletSetup {
  targets: BitcoinTarget[];
  network: BitcoinNetwork;
  asset: string;
}

/** The wallet's address set for a target: xpub expands to both BIP-84
 * chains, a plain address stays one target. */
export function bitcoinWalletSetup(
  target: string,
  gapLimit: number,
): BitcoinWalletSetup {
  const network = networkOf(target);
  return {
    targets: expandTargets(target, network, gapLimit),
    network,
    asset: bitcoinAssetId(network),
  };
}

export interface BitcoinWalk {
  txs: BitcoinTx[];
  /** The address's whole history was seen (no deeper pages, or nothing
   * deeper than the cursor left). */
  done: boolean;
  /** Oldest confirmed height in `txs`; Infinity when there were none. */
  oldestHeight: number;
}

/**
 * One descending crawl of one address: pages until the oldest page, the
 * page budget, or the first transaction older than `importedDownTo`
 * (everything below it is imported already).
 */
export async function walkBitcoinAddress(
  client: BitcoinClient,
  address: string,
  opts: { importedDownTo: number; maxPages: number },
): Promise<BitcoinWalk> {
  const txs: BitcoinTx[] = [];
  let done = false;
  let afterTxid: string | undefined;
  for (let page = 0; page < opts.maxPages; page += 1) {
    const batch = await client.addressTxs(address, afterTxid);
    txs.push(...batch);
    if (batch.length === 0) {
      done = true;
      break;
    }
    afterTxid = batch[batch.length - 1].txid;
    const oldest = oldestConfirmedHeight(batch);
    if (
      oldest !== null &&
      Number.isFinite(opts.importedDownTo) &&
      oldest < opts.importedDownTo
    ) {
      done = true;
      break;
    }
  }
  const oldest = oldestConfirmedHeight(txs);
  return { txs, done, oldestHeight: oldest ?? Number.POSITIVE_INFINITY };
}

function oldestConfirmedHeight(txs: BitcoinTx[]): number | null {
  let oldest: number | null = null;
  for (const tx of txs) {
    const height = tx.status.block_height;
    if (tx.status.confirmed && height !== undefined) {
      oldest = oldest === null ? height : Math.min(oldest, height);
    }
  }
  return oldest;
}

/**
 * Walk every target address and answer the merged, deduplicated rows and
 * the next cursor: `nextBlock` counts DOWN toward 0 - genesis is where a
 * finished walk rests.
 */
export async function fetchBitcoinHistory(
  client: BitcoinClient,
  opts: {
    targets: BitcoinTarget[];
    asset: string;
    /** Newest height NOT to reimport (Infinity = nothing imported yet). */
    importedDownTo: number;
    /** Chain tip, bounds the first walk. */
    tipHeight: number;
    maxPagesPerAddress: number;
  },
): Promise<{ rows: LedgerEventRow[]; nextBlock: number; done: boolean }> {
  if (opts.importedDownTo <= 0) {
    return { rows: [], nextBlock: 0, done: true };
  }
  let allDone = true;
  let oldest = Math.min(opts.importedDownTo, opts.tipHeight);
  const collected: BitcoinTx[] = [];
  for (const target of opts.targets) {
    const walk = await walkBitcoinAddress(client, target.address, {
      importedDownTo: opts.importedDownTo,
      maxPages: opts.maxPagesPerAddress,
    });
    collected.push(...walk.txs);
    allDone = allDone && walk.done;
    if (Number.isFinite(walk.oldestHeight)) {
      oldest = Math.min(oldest, walk.oldestHeight);
    }
  }
  const own = new Set(opts.targets.map((target) => target.address));
  return {
    rows: mapBitcoinRows(collected, own, opts.asset).events,
    nextBlock: allDone ? 0 : oldest,
    done: allDone,
  };
}

export const ethereumFetchBitcoinHistoryAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  name: "fetch-bitcoin-history",
  displayName: "Fetch Bitcoin History",
  description:
    "Walk a Bitcoin watch-only wallet's complete confirmed history through the mempool.space API (an account xpub expanded across its BIP-84 chains, or one address) as ledger rows, crawling newest-first until every address's oldest page or the page budget. Rows are keyed by txid, so overlapping runs are no-ops.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description:
        "The stackfolio/wallet-account document whose xpub or address drives the import.",
      required: true,
    }),
    gapLimit: Property.Number({
      displayName: "Gap limit",
      description:
        "Derived addresses per BIP-84 chain (receive and change). Default 20, the BIP-44 lookahead.",
      required: false,
      defaultValue: 20,
    }),
    maxPagesPerAddress: Property.Number({
      displayName: "Max pages per address",
      description: "Ceiling on txid pages per address. Default 4.",
      required: false,
      defaultValue: 4,
    }),
  },
  async run(context) {
    const auth = authProps(context.auth);
    const props = context.propsValue;
    const documentId = props.accountDocumentId.trim();
    const document = await context.reactor.get(documentId);
    if (document.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(
        `Document ${documentId} is a ${document.header.documentType}, not a ${WALLET_ACCOUNT_TYPE}.`,
      );
    }
    const global = globalState<BitcoinWalletView>(document);
    if ((global.chainId ?? 0) !== BITCOIN_CHAIN_ID) {
      throw new Error(
        `Document ${documentId} is chain ${global.chainId}, not Bitcoin (chain ${BITCOIN_CHAIN_ID}).`,
      );
    }
    const target = bitcoinWalletTarget(global, documentId);
    const { targets, network, asset } = bitcoinWalletSetup(target, props.gapLimit ?? 20);
    const client = createBitcoinClient({
      baseUrl: bitcoinConfig(auth, network).baseUrl,
    });
    const tip = await client.tipHeight();
    const cursor = global.backfill?.nextBlock;
    return fetchBitcoinHistory(client, {
      targets,
      asset,
      importedDownTo:
        cursor === null || cursor === undefined ? Number.POSITIVE_INFINITY : cursor,
      tipHeight: tip,
      maxPagesPerAddress: props.maxPagesPerAddress ?? 4,
    });
  },
});
