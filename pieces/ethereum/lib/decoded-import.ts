import {
  getBlockTimestamp,
  getLogs,
  getTransactionReceipt,
  getTransactionValue,
} from "./etherscan.js";
import { decodeReceipts, type ReceiptLike } from "./protocol-decode.js";
import type { ChainIndex } from "./manifest.js";
import type { EventRow } from "./types.js";

/** Split contract addresses into logscan-sized calls (the endpoint takes at
 * most 20 comma-joined addresses). */
export function contractChunks(addresses: string[]): string[][] {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 20) {
    chunks.push(unique.slice(i, i + 20));
  }
  return chunks;
}

export interface DecodedFetch {
  rows: EventRow[];
  decodedTxHashes: string[];
  inert: number;
  /** Hits existed beyond the receipt budget; the next window re-sees them
   * only when the caller restarts the window - the truncation flag on the
   * page walk covers that. */
  overflow: boolean;
  /** The logscan itself hit the page ceiling. */
  logsTruncated: boolean;
}

/**
 * Registry-aware rows for one block window: scan the registry contracts'
 * logs, fetch receipts for the hit transactions, and decode them against
 * the manifest index. Enrichment never fails an import - a throwing
 * indexer, a rate limit, any error yields the empty decode and the generic
 * rows stand on their own.
 */
export async function fetchDecodedRows(
  client: {
    call(params: Record<string, string | number>): Promise<unknown>;
  },
  opts: {
    index: ChainIndex;
    chainId: number;
    account: string;
    startBlock: number;
    endBlock: number;
    /** Receipts fetched per window; the free plan's budget stays predictable.
     * Default 20. */
    receiptBudget?: number;
    /** Timestamp lookup from an already-known source (the generic rows of
     * the same transactions); falls back to one block call per receipt. */
    timestampOf?: (txHash: string) => string | undefined;
  },
): Promise<DecodedFetch> {
  try {
    const addresses = opts.index.contracts.map((contract) => contract.address);
    if (addresses.length === 0) {
      return {
        rows: [],
        decodedTxHashes: [],
        inert: 0,
        overflow: false,
        logsTruncated: false,
      };
    }
    const { logs, truncated } = await getLogs(client, {
      addresses,
      startBlock: opts.startBlock,
      endBlock: opts.endBlock,
    });
    const hits = [...new Set(logs.map((log) => log.transactionHash))].filter(
      Boolean,
    );
    const budget = opts.receiptBudget ?? 20;
    const chosen = hits.slice(0, budget);
    const receipts: ReceiptLike[] = [];
    for (const hash of chosen) {
      const receipt = await getTransactionReceipt(client, hash);
      if (!receipt) continue;
      const value = await getTransactionValue(client, hash);
      const timestamp =
        opts.timestampOf?.(hash) ??
        (await getBlockTimestamp(client, receipt.blockNumber));
      receipts.push({ ...receipt, value, timestamp });
    }
    const decoded = decodeReceipts(
      opts.index,
      opts.chainId,
      opts.account,
      receipts,
    );
    return {
      ...decoded,
      overflow: hits.length > budget,
      logsTruncated: truncated,
    };
  } catch {
    return {
      rows: [],
      decodedTxHashes: [],
      inert: 0,
      overflow: false,
      logsTruncated: false,
    };
  }
}

/** Replace the generic rows of decoded transactions with the decoded ones;
 * everything else passes through untouched. */
export function mergeDecoded(
  generic: EventRow[],
  decoded: { rows: EventRow[]; decodedTxHashes: string[] },
): EventRow[] {
  const dropped = new Set(decoded.decodedTxHashes);
  return [
    ...generic.filter((row) => !dropped.has(row.eventIdentifier)),
    ...decoded.rows,
  ];
}
