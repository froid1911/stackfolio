import { createAction, Property } from "@powerhousedao/pieces-framework";

import { ethereumAuth, etherscanConfig } from "../auth.js";
import { authProps } from "../client.js";
import { createEtherscanClient, etherscanCacheDir, fetchWindow } from "../etherscan.js";
import { globalState } from "../reactor.js";
import { ETH_STAKING_TYPE } from "./import-staking-to-doc.js";

/** The first block that could carry a withdrawal (Shanghai/Capella). */
const SHANGHAI_BLOCK = 17_034_870;

interface StakingState {
  validators?: Array<{ index: number; withdrawalAddress?: string | null }>;
  withdrawals?: Array<{ withdrawalRef: number; blockNumber: number }>;
}

export interface WithdrawalRow {
  withdrawalRef: number;
  validatorIndex: number;
  amountGwei: string;
  blockNumber: number;
  timestamp: string;
}

type Client = { call(params: Record<string, string | number>): Promise<unknown> };

/**
 * New beacon withdrawals of the staking document's validators, read from
 * Etherscan per withdrawal address, from the last stored block on. Only
 * watched validators' withdrawals are kept (an address can receive other
 * validators' too); stored ones are skipped by reference. A failure is
 * reported, not thrown, like the validator read.
 */
export async function fetchWithdrawals(
  client: Client,
  state: StakingState,
): Promise<{ withdrawals: WithdrawalRow[]; error?: string }> {
  const watched = new Set((state.validators ?? []).map((v) => v.index));
  const addresses = [
    ...new Set(
      (state.validators ?? [])
        .map((v) => v.withdrawalAddress?.toLowerCase())
        .filter((a): a is string => Boolean(a)),
    ),
  ];
  const stored = state.withdrawals ?? [];
  const held = new Set(stored.map((w) => w.withdrawalRef));
  // Re-read the last stored block: it may hold more than one withdrawal.
  const startBlock = stored.length > 0 ? Math.max(...stored.map((w) => w.blockNumber)) : SHANGHAI_BLOCK;

  const found = new Map<number, WithdrawalRow>();
  try {
    for (const address of addresses) {
      const rows = await fetchWindow(client, {
        address,
        action: "txsBeaconWithdrawal",
        startBlock,
        endBlock: 99_999_999,
      });
      for (const r of rows) {
        const withdrawalRef = Number(r.withdrawalIndex);
        const validatorIndex = Number(r.validatorIndex);
        const blockNumber = Number(r.blockNumber);
        const seconds = Number(r.timestamp);
        const amountGwei = r.amount ?? "";
        if (
          !Number.isInteger(withdrawalRef) ||
          !Number.isInteger(validatorIndex) ||
          !Number.isInteger(blockNumber) ||
          !Number.isFinite(seconds) ||
          !/^(0|[1-9][0-9]*)$/.test(amountGwei)
        ) {
          continue;
        }
        if (!watched.has(validatorIndex) || held.has(withdrawalRef)) continue;
        found.set(withdrawalRef, {
          withdrawalRef,
          validatorIndex,
          amountGwei,
          blockNumber,
          timestamp: new Date(seconds * 1000).toISOString(),
        });
      }
    }
  } catch (error) {
    return { withdrawals: [], error: error instanceof Error ? error.message : String(error) };
  }
  return { withdrawals: [...found.values()].sort((a, b) => a.withdrawalRef - b.withdrawalRef) };
}

export const ethereumFetchWithdrawalsAction = createAction({
  auth: ethereumAuth,
  requireReactor: "read",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-withdrawals",
  displayName: "Fetch Validator Withdrawals",
  description:
    "Read new beacon-chain withdrawals (reward skims and exits) of the staking document's validators from Etherscan, by withdrawal address, from the last stored block on. Output feeds import-staking-to-doc's withdrawals. A failed read is reported in `error`, never thrown.",
  props: {
    stakingDocumentId: Property.ShortText({
      displayName: "Staking document id",
      required: true,
    }),
  },
  async run(context) {
    const auth = etherscanConfig(authProps(context.auth));
    const document = await context.reactor.get(context.propsValue.stakingDocumentId.trim());
    if (document.header.documentType !== ETH_STAKING_TYPE) {
      throw new Error(
        `Document ${context.propsValue.stakingDocumentId} is a ${document.header.documentType}, not ${ETH_STAKING_TYPE}.`,
      );
    }
    const client = createEtherscanClient({
      apiKey: auth.apiKey,
      baseUrl: auth.baseUrl,
      chainId: 1,
      cacheDir: etherscanCacheDir(),
    });
    return fetchWithdrawals(client, globalState<StakingState>(document));
  },
});
