import { createPublicClient, http } from "viem";
import { getBlockReceipts } from "viem/actions";
import type { TransferLog } from "./decode.js";
import type { EthereumAuth } from "./types.js";

export const DEFAULT_RPC_URL = "http://127.0.0.1:8545";
export const DEFAULT_BEACON_URL = "http://127.0.0.1:5052";
export const DEFAULT_CHAIN_ID = 1;

export interface GetLogsParams {
  fromBlock: bigint;
  toBlock: bigint;
  topics: Array<`0x${string}` | null>;
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
  getBalance(address: string, block?: bigint): Promise<bigint>;
  getNonce(address: string, block?: bigint): Promise<number>;
  ethCall(to: string, data: string): Promise<string>;
}

/**
 * A step's resolved auth bundle, or empty when the engine attached none.
 * Every auth field is optional by design - empty means the localhost node
 * defaults - so a missing auth must fail to the defaults, not crash on a
 * property read.
 */
export function authProps(
  auth: { props: Partial<EthereumAuth> } | undefined,
): Partial<EthereumAuth> {
  return auth?.props ?? {};
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
      // Raw eth_getLogs: viem 2.57's getLogs serialises a plain topics
      // array as an empty filter, and an unfiltered query for a few
      // hundred mainnet blocks answers hundreds of megabytes. One
      // question, sent exactly as asked, cannot be misfiled.
      const logs = await client.request({
        method: "eth_getLogs",
        params: [
          {
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
            // Positional nulls stay: they are "any topic at this index",
            // and dropping them would shift every later topic one up.
            topics,
          },
        ],
      });
      return logs.map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
        logIndex: Number(log.logIndex),
        blockNumber: BigInt(log.blockNumber),
        transactionHash: log.transactionHash,
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
    getBalance(address, block) {
      return client.getBalance({
        address: address as `0x${string}`,
        ...(block === undefined ? {} : { blockNumber: block }),
      });
    },
    async getNonce(address, block) {
      return Number(
        await client.getTransactionCount({
          address: address as `0x${string}`,
          ...(block === undefined ? {} : { blockNumber: block }),
        }),
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
