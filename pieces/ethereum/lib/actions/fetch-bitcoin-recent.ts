/**
 * Bitcoin live round: everything the watch-only wallet did above its scan
 * cursor, plus its confirmed balance (the sum of its UTXO set). One
 * address-page per derived address - mempool.space answers newest-first,
 * so the first page covers every honest wallet's gap since the last poll.
 * Unconfirmed transactions are skipped (no timestamp yet), but the tip
 * height is answered either way so the cursor rides the chain.
 */
import { createAction, Property } from "@powerhousedao/pieces-framework";
import { bitcoinConfig, ethereumAuth } from "../auth.js";
import { authProps } from "../client.js";
import { globalState } from "../reactor.js";
import {
  createBitcoinClient,
  type BitcoinTx,
} from "../bitcoin.js";
import { mapBitcoinRows } from "../bitcoin-rows.js";
import { BITCOIN_CHAIN_ID } from "../providers.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";
import {
  bitcoinWalletSetup,
  bitcoinWalletTarget,
  type BitcoinWalletView,
} from "./fetch-bitcoin-history.js";
import type { LedgerEventRow } from "../etherscan-rows.js";

export async function fetchBitcoinRecent(
  client: ReturnType<typeof createBitcoinClient>,
  opts: {
    targets: Array<{ address: string }>;
    asset: string;
    /** Confirmed heights AT OR BELOW this are already imported. */
    aboveHeight: number;
  },
): Promise<{
  rows: LedgerEventRow[];
  balanceSats: string;
  lastBlock: number;
}> {
  const tip = await client.tipHeight();
  const own = new Set(opts.targets.map((target) => target.address));
  const txs = new Map<string, BitcoinTx>();
  let balance = 0n;
  for (const target of opts.targets) {
    const [page, utxos] = [
      await client.addressTxs(target.address),
      await client.addressUtxos(target.address),
    ];
    for (const tx of page) {
      const height = tx.status.block_height;
      if (
        tx.status.confirmed &&
        height !== undefined &&
        height > opts.aboveHeight
      ) {
        txs.set(tx.txid, tx);
      }
    }
    for (const utxo of utxos) balance += BigInt(utxo.value);
  }
  let lastBlock = tip;
  for (const tx of txs.values()) {
    lastBlock = Math.max(lastBlock, tx.status.block_height ?? 0);
  }
  return {
    rows: mapBitcoinRows([...txs.values()], own, opts.asset).events,
    balanceSats: balance.toString(),
    lastBlock,
  };
}

export const ethereumFetchBitcoinRecentAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  name: "fetch-bitcoin-recent",
  displayName: "Fetch Bitcoin Recent",
  description:
    "Poll a Bitcoin watch-only wallet (an account xpub expanded across its BIP-84 chains, or one address) for confirmed transactions above the scan cursor, plus its current UTXO balance.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description: "The stackfolio/wallet-account document to poll.",
      required: true,
    }),
    gapLimit: Property.Number({
      displayName: "Gap limit",
      description:
        "Derived addresses per BIP-84 chain (receive and change). Default 20, the BIP-44 lookahead.",
      required: false,
      defaultValue: 20,
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
    const cursor = global.cursor?.lastNativeScanBlock;
    return fetchBitcoinRecent(client, {
      targets,
      asset,
      aboveHeight: cursor === null || cursor === undefined ? 0 : cursor,
    });
  },
});
