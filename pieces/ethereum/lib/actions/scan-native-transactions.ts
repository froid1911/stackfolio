import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ethereumAuth } from "../auth.js";
import {
  authProps,
  createClientBundle,
  type BlockView,
  type ReceiptView,
} from "../client.js";
import { NATIVE_ASSET } from "../decode.js";
import type { EventRow } from "../types.js";

export const WALLET_ACCOUNT_TYPE = "stackfolio/wallet-account";

/** Contract creation credits no counterparty; book the burn address. */
const NULL_ADDRESS = `0x${"0".repeat(40)}`;

const GWEI_TO_WEI = 1_000_000_000n;

/**
 * Rows for one block: native value moves (slot 0 for the account spending,
 * slot 1 for it receiving — a self-transfer books both), one fee row per
 * account-initiated transaction (slot 2), and STAKING/WITHDRAWAL rows for
 * beacon withdrawals to the account. Fixed slots keep every
 * `(eventIdentifier, sequenceIndex)` stable across reruns.
 */
export function nativeRowsForBlock(
  block: BlockView,
  receipts: Map<string, ReceiptView>,
  account: string,
): EventRow[] {
  const wanted = account.toLowerCase();
  const rows: EventRow[] = [];
  for (const tx of block.transactions) {
    const from = tx.from.toLowerCase();
    const to = tx.to?.toLowerCase() ?? null;
    const spent = from === wanted;
    const received = to === wanted;
    if (!spent && !received) continue;
    if (spent && tx.value > 0n) {
      rows.push({
        eventIdentifier: tx.hash,
        sequenceIndex: 0,
        timestamp: block.timestamp,
        type: "SPEND",
        subtype: "NONE",
        asset: NATIVE_ASSET,
        amount: tx.value.toString(),
        counterparty: to ?? NULL_ADDRESS,
        notes: null,
      });
    }
    if (received && tx.value > 0n) {
      rows.push({
        eventIdentifier: tx.hash,
        sequenceIndex: 1,
        timestamp: block.timestamp,
        type: "RECEIVE",
        subtype: "NONE",
        asset: NATIVE_ASSET,
        amount: tx.value.toString(),
        counterparty: from,
        notes: null,
      });
    }
    if (spent) {
      const receipt = receipts.get(tx.hash);
      const fee = receipt
        ? receipt.gasUsed * receipt.effectiveGasPrice
        : 0n;
      if (fee > 0n) {
        rows.push({
          eventIdentifier: tx.hash,
          sequenceIndex: 2,
          timestamp: block.timestamp,
          type: "SPEND",
          subtype: "FEE",
          asset: NATIVE_ASSET,
          amount: fee.toString(),
          counterparty: NULL_ADDRESS,
          notes: null,
        });
      }
    }
  }
  for (const withdrawal of block.withdrawals) {
    if (withdrawal.address.toLowerCase() !== wanted) continue;
    rows.push({
      eventIdentifier: `withdrawal-${withdrawal.index}`,
      sequenceIndex: 0,
      timestamp: block.timestamp,
      type: "STAKING",
      subtype: "WITHDRAWAL",
      asset: NATIVE_ASSET,
      amount: (BigInt(withdrawal.amountGwei) * GWEI_TO_WEI).toString(),
      counterparty: withdrawal.address.toLowerCase(),
      notes: null,
    });
  }
  return rows;
}

interface WalletAccountGlobal {
  address: string;
  chainId: number;
  backfill: { state: string; startBlock: number | null; nextBlock: number | null } | null;
}

export const ethereumScanNativeTransactionsAction = createAction({
  auth: ethereumAuth,
  // Saved workflows refer to the action by name: don't rename it once published
  name: "scan-native-transactions",
  requireReactor: "read",
  displayName: "Scan Native Transactions",
  description:
    "Walk a window of blocks for a stackfolio/wallet-account document, decoding Ether moves, transaction fees and beacon-chain withdrawals into ledger rows. BACKFILL walks forward from the document's backfill.nextBlock; HEAD scans the newest window for updates. Emits { rows, nextBlock, done }.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description:
        "The stackfolio/wallet-account document whose address and backfill cursor drive the walk.",
      required: true,
    }),
    maxBlocks: Property.Number({
      displayName: "Max blocks per run",
      description: "Blocks walked in one call. Default 500.",
      required: false,
      defaultValue: 500,
    }),
    direction: Property.StaticDropdown({
      displayName: "Direction",
      description:
        "BACKFILL: forward from the cursor (initial history). HEAD: the newest window, for steady updates.",
      required: false,
      options: {
        options: [
          { label: "Backfill forward", value: "BACKFILL" },
          { label: "Head window", value: "HEAD" },
        ],
      },
    }),
  },
  async run(context) {
    const props = context.propsValue;
    const documentId = props.accountDocumentId.trim();
    const document = await context.reactor.get(documentId);
    if (document.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(
        `Document ${documentId} is a ${document.header.documentType}, not a ${WALLET_ACCOUNT_TYPE}.`,
      );
    }
    const state = document.state as { global?: WalletAccountGlobal };
    const account = state.global?.address ?? "";
    if (account === "") {
      throw new Error(
        `Document ${documentId} has no address yet — set the account details before scanning.`,
      );
    }
    const backfill = state.global?.backfill;
    if (props.direction !== "HEAD" && (!backfill || backfill.nextBlock === null)) {
      throw new Error(
        `Document ${documentId} has no backfill cursor — record its backfill state before the native walk.`,
      );
    }

    const maxBlocks = props.maxBlocks ?? 500;
    const clients = createClientBundle(authProps(context.auth));
    const head = Number(await clients.getBlockNumber());

    // The head window needs no cursor: a wallet that has never walked its
    // history still gets the newest blocks from its first run.
    const fromBlock =
      props.direction === "HEAD"
        ? Math.max(backfill?.nextBlock ?? 0, head - maxBlocks + 1)
        : (backfill?.nextBlock ?? 0);
    const toBlock = Math.min(fromBlock + maxBlocks - 1, head);

    if (fromBlock > head) {
      return {
        rows: [],
        nextBlock: fromBlock,
        done: true,
        accountDocumentId: documentId,
      };
    }

    const rows: EventRow[] = [];
    // Bounded parallel fetch: a 2000-block head walk must fit the piece
    // worker's budget. Slices stay in block order; rows keep their slots.
    const BLOCK_PARALLELISM = 8;
    for (let start = fromBlock; start <= toBlock; start += BLOCK_PARALLELISM) {
      const end = Math.min(start + BLOCK_PARALLELISM - 1, toBlock);
      const slices = await Promise.all(
        Array.from({ length: end - start + 1 }, async (_, offset) => {
          const number = BigInt(start + offset);
          const [block, receipts] = await Promise.all([
            clients.getBlockWithTxs(number),
            clients.getBlockReceipts(number),
          ]);
          return nativeRowsForBlock(
            block,
            new Map(
              receipts.map((receipt) => [receipt.transactionHash, receipt]),
            ),
            account,
          );
        }),
      );
      for (const slice of slices) rows.push(...slice);
    }

    const nextBlock = toBlock + 1;
    return {
      rows,
      nextBlock,
      done: nextBlock > head,
      accountDocumentId: documentId,
    };
  },
});
