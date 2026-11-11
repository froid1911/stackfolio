import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ethereumAuth } from "../auth.js";
import { createClientBundle, type ClientBundle } from "../client.js";
import {
  TRANSFER_TOPIC,
  chunkRange,
  decodeTransferLogs,
  topicForAddress,
  type TransferLog,
} from "../decode.js";
import type { EventRow, ScanPage } from "../types.js";

export const WALLET_ACCOUNT_TYPE = "stackfolio/wallet-account";

interface WalletAccountGlobal {
  address: string;
  chainId: number;
  cursor: { lastLogsBlock: number | null } | null;
}

export interface ScanOptions {
  account: string;
  chainId: number;
  fromBlock: number;
  maxBlocks: number;
  maxLogs: number;
}

/**
 * One bounded scan page over `fromBlock..head`. Queries stay under the
 * node's limits: ranges are chunked to `maxBlocks`, and a chunk returning
 * `maxLogs` logs is halved until it fits — a single block that still
 * overflows ends the page with `truncated: true`, so the cursor only ever
 * advances over fully scanned blocks.
 */
export async function scanLogsPage(
  clients: ClientBundle,
  options: ScanOptions,
): Promise<ScanPage> {
  const head = Number(await clients.getBlockNumber());
  if (options.fromBlock > head) {
    return { rows: [], lastBlock: head, tokens: [], truncated: false };
  }
  const rows: EventRow[] = [];
  const tokens = new Set<string>();
  let lastBlock = options.fromBlock - 1;

  const scanChunk = async (from: number, to: number): Promise<boolean> => {
    const logs = await fetchTransferLogs(clients, from, to, options.account);
    if (logs.length >= options.maxLogs) {
      if (from === to) return false;
      const mid = from + Math.floor((to - from) / 2);
      return (await scanChunk(from, mid)) && (await scanChunk(mid + 1, to));
    }
    if (logs.length > 0) {
      const timestamps = new Map<number, string>();
      for (const log of logs) {
        const block = Number(log.blockNumber);
        if (!timestamps.has(block)) {
          timestamps.set(block, await clients.getBlockTimestamp(BigInt(block)));
        }
      }
      rows.push(
        ...decodeTransferLogs(logs, options.account, options.chainId, timestamps),
      );
      for (const log of logs) tokens.add(log.address.toLowerCase());
    }
    lastBlock = to;
    return true;
  };

  for (const [from, to] of chunkRange(
    options.fromBlock,
    head,
    options.maxBlocks,
  )) {
    if (!(await scanChunk(from, to))) {
      return {
        rows,
        lastBlock,
        tokens: [...tokens],
        truncated: true,
      };
    }
  }
  return { rows, lastBlock: head, tokens: [...tokens], truncated: false };
}

/** Transfer logs involving `account` in a block range, from both the
 * sending (topic1) and receiving (topic2) side, deduped for self-transfers. */
async function fetchTransferLogs(
  clients: ClientBundle,
  from: number,
  to: number,
  account: string,
): Promise<TransferLog[]> {
  const accountTopic = topicForAddress(account);
  const [sending, receiving] = await Promise.all([
    clients.getLogs({
      fromBlock: BigInt(from),
      toBlock: BigInt(to),
      topics: [TRANSFER_TOPIC, accountTopic],
    }),
    clients.getLogs({
      fromBlock: BigInt(from),
      toBlock: BigInt(to),
      topics: [TRANSFER_TOPIC, null, accountTopic],
    }),
  ]);
  const merged = new Map<string, TransferLog>();
  for (const log of [...sending, ...receiving]) {
    merged.set(`${log.transactionHash}:${log.logIndex}`, log);
  }
  return [...merged.values()];
}

export const ethereumScanAccountLogsAction = createAction({
  auth: ethereumAuth,
  // Saved workflows refer to the action by name: don't rename it once published
  name: "scan-account-logs",
  requireReactor: "read",
  displayName: "Scan Account Logs",
  description:
    "Read one bounded page of ERC-20 Transfer logs for a stackfolio/wallet-account document, starting just behind its scan cursor. Emits decoded ledger rows (SPEND/RECEIVE with decimals and counterparties), the block the cursor may advance to, the token identifiers touched, and a truncated flag when one block overflowed the log cap.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      description:
        "The stackfolio/wallet-account document to scan; its cursor sets the first block.",
      required: true,
    }),
    maxBlocks: Property.Number({
      displayName: "Max blocks per chunk",
      description:
        "Upper bound of blocks per eth_getLogs call. Default 500 keeps well under geth's 5000-block range cap.",
      required: false,
      defaultValue: 500,
    }),
    maxLogs: Property.Number({
      displayName: "Max logs per query",
      description:
        "Upper bound of logs per eth_getLogs call. Default 5000 keeps well under geth's 10000-log cap. A chunk hitting it is halved; a single block hitting it ends the page truncated.",
      required: false,
      defaultValue: 5000,
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
    const chainId =
      state.global?.chainId ?? (context.auth.props.chainId) ?? 1;
    const clients = createClientBundle(context.auth.props);
    const page = await scanLogsPage(clients, {
      account,
      chainId,
      fromBlock: (state.global?.cursor?.lastLogsBlock ?? -1) + 1,
      maxBlocks: props.maxBlocks ?? 500,
      maxLogs: props.maxLogs ?? 5000,
    });
    return { ...page, accountDocumentId: documentId };
  },
});
