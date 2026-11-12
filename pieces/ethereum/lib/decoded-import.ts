import {
  getBlockTimestamp,
  getTransactionReceipt,
  getTransactionValue,
} from "./etherscan.js";
import { decodeReceipts, type ReceiptLike } from "./protocol-decode.js";
import type { ChainIndex } from "./manifest.js";
import type { EventRow } from "./types.js";

export interface DecodedFetch {
  rows: EventRow[];
  decodedTxHashes: string[];
  inert: number;
  /** Candidates existed beyond the receipt budget; they re-decode when the
   * window is re-walked (a re-decode pass re-imports the window). */
  overflow: boolean;
}

/**
 * Registry-aware rows for one block window: take the account's own
 * transactions whose recipient is a registry contract, fetch their
 * receipts, and decode them against the manifest index. Scanning the
 * registry contracts' own logs instead drowns in stranger's traffic (a
 * busy pool emits more logs per window than the endpoint pages), and its
 * address-list calls fail outright on Etherscan V2 - only the account's
 * txlist is a cheap, precise candidate source. A protocol interaction
 * hidden behind a non-registry `to` (a zap contract calling Curve, say)
 * needs the zap in the registry to be seen; that is the accepted gap.
 * Enrichment never fails an import - a throwing indexer, a rate limit,
 * any error yields the empty decode and the generic rows stand alone.
 */
export async function fetchDecodedRows(
  client: {
    call(params: Record<string, string | number>): Promise<unknown>;
  },
  opts: {
    index: ChainIndex;
    chainId: number;
    account: string;
    /** The window's account transactions (txlist rows); only those sent to
     * a registry contract become decode candidates. */
    transactions: readonly { hash: string; to?: string | null }[];
    /** Receipts fetched per window; the free plan's budget stays predictable.
     * Default 50. */
    receiptBudget?: number;
    /** Timestamp lookup from an already-known source (the generic rows of
     * the same transactions); falls back to one block call per receipt. */
    timestampOf?: (txHash: string) => string | undefined;
  },
): Promise<DecodedFetch> {
  const empty: DecodedFetch = {
    rows: [],
    decodedTxHashes: [],
    inert: 0,
    overflow: false,
  };
  try {
    const registry = new Set(
      opts.index.contracts.map((contract) => contract.address.toLowerCase()),
    );
    if (registry.size === 0) return empty;
    const candidates = [
      ...new Set(
        opts.transactions
          .filter(
            (tx) =>
              tx.hash !== "" &&
              tx.to !== null &&
              tx.to !== undefined &&
              registry.has(tx.to.toLowerCase()),
          )
          .map((tx) => tx.hash),
      ),
    ];
    const budget = opts.receiptBudget ?? 50;
    const chosen = candidates.slice(0, budget);
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
    return { ...decoded, overflow: candidates.length > budget };
  } catch {
    return empty;
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
