import { createPublicClient, http, type GetLogsParameters } from "viem";
import { getBlockReceipts } from "viem/actions";
import type { TransferLog } from "./decode.js";
import type { EthereumAuth } from "./types.js";

export const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
export const DEFAULT_BEACON_URL = "http://127.0.0.1:5052";
export const DEFAULT_CHAIN_ID = 1;

export interface GetLogsParams {
  fromBlock: bigint;
  toBlock: bigint;
  topics: Array<string | null>;
}

/** A block narrowed to what the native walker reads. */
export interface BlockView {
  number: number;
  timestamp: string;
  hash: string;
  transactions: Array<{
    hash: string;
    from: string;
    to: string | null;
    value: bigint;
  }>;
  withdrawals: Array<{ index: number; address: string; amountGwei: number }>;
}

export interface ReceiptView {
  transactionHash: string;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
}

/** Everything the actions ask of the node, kept narrow so tests can hand in
 * a fake bundle instead of a network. */
export interface ClientBundle {
  getLogs(params: GetLogsParams): Promise<TransferLog[]>;
  getBlockNumber(): Promise<bigint>;
  getBlockTimestamp(blockNumber: bigint): Promise<string>;
  getBlockWithTxs(blockNumber: bigint): Promise<BlockView>;
  getBlockReceipts(blockNumber: bigint): Promise<ReceiptView[]>;
  getBalance(address: string): Promise<bigint>;
  getNonce(address: string): Promise<number>;
  ethCall(to: string, data: string): Promise<string>;
}

/**
 * A viem-backed bundle for the auth's RPC URL. `overrides` replaces any
 * subset — the seam the action tests use; production passes nothing.
 */
export function createClientBundle(
  auth: Partial<EthereumAuth> | undefined,
  overrides?: Partial<ClientBundle>,
): ClientBundle {
  const rpcUrl = auth?.rpcUrl?.trim() || DEFAULT_RPC_URL;
  const client = createPublicClient({ transport: http(rpcUrl) });
  const bundle: ClientBundle = {
    async getLogs({ fromBlock, toBlock, topics }) {
      // Cast over viem's overloaded filter union: this piece only ever uses
      // the plain block-range + topics shape, no eventAbi.
      const logs = await client.getLogs({
        fromBlock,
        toBlock,
        topics,
      } as GetLogsParameters);
      return logs.map((log) => ({
        address: log.address,
        topics: log.topics as string[],
        data: log.data,
        logIndex: Number(log.logIndex),
        blockNumber: log.blockNumber ?? 0n,
        transactionHash: log.transactionHash ?? "",
      }));
    },
    getBlockNumber() {
      return client.getBlockNumber();
    },
    async getBlockTimestamp(blockNumber) {
      const block = await client.getBlock({ blockNumber });
      return new Date(Number(block.timestamp) * 1000).toISOString();
    },
    async getBlockWithTxs(blockNumber) {
      const block = await client.getBlock({
        blockNumber,
        includeTransactions: true,
      });
      return {
        number: Number(block.number),
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        hash: block.hash,
        // includeTransactions: true guarantees full transactions, though the
        // overload types still say `Transaction | Hash` per element.
        transactions: (
          block.transactions as unknown as Array<{
            hash: `0x${string}`;
            from: `0x${string}`;
            to: `0x${string}` | null;
            value: bigint;
          }>
        ).map((tx) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: tx.value,
        })),
        withdrawals: (block.withdrawals ?? []).map((withdrawal) => ({
          index: Number(withdrawal.index),
          address: withdrawal.address,
          amountGwei: Number(withdrawal.amount),
        })),
      };
    },
    async getBlockReceipts(blockNumber) {
      const receipts = await getBlockReceipts(client, { blockNumber });
      return receipts.map((receipt) => ({
        transactionHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
      }));
    },
    getBalance(address) {
      return client.getBalance({ address: address as `0x${string}` });
    },
    async getNonce(address) {
      return Number(
        await client.getTransactionCount({ address: address as `0x${string}` }),
      );
    },
    async ethCall(to, data) {
      const result = await client.request({
        method: "eth_call",
        params: [{ to: to as `0x${string}`, data: data as `0x${string}` }, "latest"],
      });
      return result;
    },
  };
  return overrides ? { ...bundle, ...overrides } : bundle;
}
