import type { EventRow } from "./types.js";

/** keccak256("Transfer(address,address,uint256)") — the only event this piece
 * decodes straight from the chain; everything else arrives as Transfer. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** CAIP-2/SLIP-44 identifier of Ether on mainnet, the registry's first entry. */
export const NATIVE_ASSET = "eip155:1/slip44:60";

/** An address as its left-padded 32-byte log topic (always lowercase). */
export function topicForAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.toLowerCase().slice(2)}`;
}

/** CAIP-19-style identifier of an ERC-20, as the asset registry stores it. */
export function erc20Asset(chainId: number, token: string): string {
  return `eip155:${chainId}/erc20:${token.toLowerCase()}`;
}

/** The uint256 payload of a Transfer log as an unsigned decimal string. */
export function amountFromData(data: string): string {
  return BigInt(data).toString();
}

/** A log as the action sees it: what viem's `getLogs` returns, narrowed to
 * the fields decoding needs. */
export interface TransferLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  blockNumber: bigint;
  transactionHash: string;
}

function addressFromTopic(topic: string): string {
  return `0x${topic.toLowerCase().slice(-40)}`;
}

/**
 * Turn Transfer logs that involve `account` into ledger rows: the account
 * sending (topic1) is a SPEND, receiving (topic2) a RECEIVE; a self-transfer
 * is booked as a SPEND. `blockTimestamps` maps block numbers to ISO times —
 * a missing block is a caller bug, so this throws rather than guessing.
 */
export function decodeTransferLogs(
  logs: TransferLog[],
  account: string,
  chainId: number,
  blockTimestamps: Map<number, string>,
): EventRow[] {
  const wanted = account.toLowerCase();
  const rows: EventRow[] = [];
  for (const log of logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;
    const from = log.topics[1] ? addressFromTopic(log.topics[1]) : null;
    const to = log.topics[2] ? addressFromTopic(log.topics[2]) : null;
    const isSpend = from === wanted;
    const isReceive = to === wanted;
    if (!isSpend && !isReceive) continue;
    const timestamp = blockTimestamps.get(Number(log.blockNumber));
    if (timestamp === undefined) {
      throw new Error(
        `No timestamp fetched for block ${log.blockNumber}, which holds log ${log.transactionHash}/${log.logIndex}.`,
      );
    }
    const counterparty = isSpend ? (to ?? from) : (from ?? to);
    rows.push({
      eventIdentifier: log.transactionHash,
      sequenceIndex: log.logIndex,
      timestamp,
      type: isSpend ? "SPEND" : "RECEIVE",
      subtype: "NONE",
      asset: erc20Asset(chainId, log.address),
      amount: amountFromData(log.data),
      counterparty: counterparty ?? wanted,
      notes: null,
    });
  }
  return rows;
}

/** Split an inclusive block range into chunks of at most `maxBlocks` blocks. */
export function chunkRange(
  from: number,
  to: number,
  maxBlocks: number,
): Array<[number, number]> {
  if (maxBlocks < 1) {
    throw new Error(`maxBlocks must be at least 1, got ${maxBlocks}`);
  }
  const chunks: Array<[number, number]> = [];
  for (let start = from; start <= to; start += maxBlocks) {
    chunks.push([start, Math.min(start + maxBlocks - 1, to)]);
  }
  return chunks;
}
