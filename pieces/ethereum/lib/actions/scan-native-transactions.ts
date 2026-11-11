import { createAction, Property } from "@powerhousedao/pieces-framework";
import { formatUnits } from "viem";
import { ethereumAuth } from "../auth.js";
import {
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
        amount: formatUnits(tx.value, 18),
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
        amount: formatUnits(tx.value, 18),
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
          amount: formatUnits(fee, 18),
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
      amount: formatUnits(BigInt(withdrawal.amountGwei) * GWEI_TO_WEI, 18),
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
    if (!backfill || backfill.nextBlock === null) {
      throw new Error(
        `Document ${documentId} has no backfill cursor — record its backfill state before the native walk.`,
      );
    }

    const maxBlocks = props.maxBlocks ?? 500;
    const clients = createClientBundle(context.auth.props);
    const head = Number(await clients.getBlockNumber());

    const fromBlock =
      props.direction === "HEAD"
        ? Math.max(backfill.nextBlock, head - maxBlocks + 1)
        : backfill.nextBlock;
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
    for (let number = fromBlock; number <= toBlock; number += 1) {
      const block = await clients.getBlockWithTxs(BigInt(number));
      const receipts = new Map(
        (await clients.getBlockReceipts(BigInt(number))).map((receipt) => [
          receipt.transactionHash,
          receipt,
        ]),
      );
      rows.push(...nativeRowsForBlock(block, receipts, account));
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
