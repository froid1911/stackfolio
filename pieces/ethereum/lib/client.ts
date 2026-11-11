import { createPublicClient, http, type GetLogsParameters } from "viem";
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

/** Everything the actions ask of the node, kept narrow so tests can hand in
 * a fake bundle instead of a network. */
export interface ClientBundle {
  getLogs(params: GetLogsParams): Promise<TransferLog[]>;
  getBlockNumber(): Promise<bigint>;
  getBlockTimestamp(blockNumber: bigint): Promise<string>;
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
  };
  return overrides ? { ...bundle, ...overrides } : bundle;
}
