import { createAction, Property } from "@powerhousedao/pieces-framework";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { ethereumAuth } from "../auth.js";
import { authProps, DEFAULT_RPC_URL } from "../client.js";
import { globalState, toGlobalAction } from "../reactor.js";

const WALLET_ACCOUNT_TYPE = "stackfolio/wallet-account";
/** Deployed at this address on every chain below. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
/** balanceOf calls per multicall request. */
const PER_CALL = 300;

/**
 * Keyless RPCs for the chains a wallet can live on; mainnet reads the
 * connection's own node. Each answered eth_blockNumber and carries
 * Multicall3 when added.
 */
const PUBLIC_RPC: Record<number, string> = {
  10: "https://mainnet.optimism.io",
  56: "https://bsc-dataseed.bnbchain.org",
  137: "https://polygon-bor-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  42161: "https://arb1.arbitrum.io/rpc",
  43114: "https://api.avax.network/ext/bc/C/rpc",
};

interface WalletState {
  address?: string;
  chainId?: number;
  ignored?: boolean;
  ledger?: Array<{ asset: string }>;
  tokenBalances?: { blockNumber: number; balances: Array<{ asset: string; amount: string }> } | null;
}

export interface TokenBalance {
  asset: string;
  amount: string;
}

/** The chain's ERC-20 contracts the wallet's ledger has touched, sorted. */
export function ledgerTokens(state: WalletState): { asset: string; contract: Address }[] {
  const prefix = `eip155:${state.chainId ?? 1}/erc20:`;
  const assets = new Set<string>();
  for (const event of state.ledger ?? []) {
    if (event.asset.startsWith(prefix) && /^0x[0-9a-fA-F]{40}$/.test(event.asset.slice(prefix.length))) {
      assets.add(event.asset);
    }
  }
  return [...assets].sort().map((asset) => ({ asset, contract: asset.slice(prefix.length) as Address }));
}

/** Whether a reading says anything the stored one does not. */
export function sameReading(stored: TokenBalance[] | undefined, next: TokenBalance[]): boolean {
  if (!stored || stored.length !== next.length) return false;
  const held = new Map(stored.map((b) => [b.asset, b.amount]));
  return next.every((b) => held.get(b.asset) === b.amount);
}

type Reader = {
  getBlockNumber(): Promise<bigint>;
  multicall(args: {
    contracts: { address: Address; abi: typeof erc20Abi; functionName: "balanceOf"; args: [Address] }[];
    allowFailure: true;
    blockNumber: bigint;
    multicallAddress: Address;
  }): Promise<Array<{ status: "success"; result: bigint } | { status: "failure"; error: Error }>>;
};

/**
 * balanceOf for each token at one block. A token whose call fails (not an
 * ERC-20, a self-destructed spam contract) is left out, so its ledger net
 * stands rather than reading as zero.
 */
export async function readTokenBalances(
  reader: Reader,
  owner: Address,
  tokens: { asset: string; contract: Address }[],
): Promise<{ blockNumber: number; balances: TokenBalance[]; failed: number }> {
  const blockNumber = await reader.getBlockNumber();
  const balances: TokenBalance[] = [];
  let failed = 0;
  for (let at = 0; at < tokens.length; at += PER_CALL) {
    const chunk = tokens.slice(at, at + PER_CALL);
    const answers = await reader.multicall({
      contracts: chunk.map((t) => ({
        address: t.contract,
        abi: erc20Abi,
        functionName: "balanceOf" as const,
        args: [owner] as [Address],
      })),
      allowFailure: true,
      blockNumber,
      multicallAddress: MULTICALL3,
    });
    answers.forEach((answer, i) => {
      if (answer.status === "success" && typeof answer.result === "bigint" && answer.result >= 0n) {
        balances.push({ asset: chunk[i].asset, amount: answer.result.toString() });
      } else {
        failed += 1;
      }
    });
  }
  return { blockNumber: Number(blockNumber), balances, failed };
}

export const ethereumFetchTokenBalancesAction = createAction({
  auth: ethereumAuth,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-token-balances",
  displayName: "Fetch Token Balances",
  description:
    "Read balanceOf, at one block, for every ERC-20 the wallet's ledger has touched (Multicall3; mainnet on the connection's node, other chains on public RPCs) and record it with SET_TOKEN_BALANCES when it changed. Holdings then use these balances instead of the sum of transfers.",
  props: {
    accountDocumentId: Property.ShortText({
      displayName: "Wallet account document",
      required: true,
    }),
  },
  async run(context) {
    const props = context.propsValue as typeof context.propsValue & {
      /** Tests pass a reader instead of an RPC. */
      reader?: Reader;
      now?: string;
    };
    const documentId = props.accountDocumentId.trim();
    const document = await context.reactor.get(documentId);
    if (document.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(`Document ${documentId} is a ${document.header.documentType}, not a ${WALLET_ACCOUNT_TYPE}.`);
    }
    const state = globalState<WalletState>(document);
    const chainId = state.chainId ?? 1;
    if (state.ignored || !state.address) return { skipped: "ignored or no address" };
    const rpcUrl =
      chainId === 1 ? authProps(context.auth).rpcUrl?.trim() || DEFAULT_RPC_URL : PUBLIC_RPC[chainId];
    if (!rpcUrl) return { skipped: `no RPC for chain ${chainId}` };
    const tokens = ledgerTokens(state);
    if (tokens.length === 0) return { tokens: 0, changed: false };

    const reader = props.reader ?? (createPublicClient({ transport: http(rpcUrl) }) as unknown as Reader);
    let reading;
    try {
      reading = await readTokenBalances(reader, state.address as Address, tokens);
    } catch (error) {
      // An RPC that does not answer leaves the last reading; next run retries.
      return { tokens: tokens.length, changed: false, error: (error as Error).message };
    }
    const stored = state.tokenBalances;
    if (stored && reading.blockNumber < stored.blockNumber) {
      return { tokens: tokens.length, changed: false, behind: true };
    }
    if (sameReading(stored?.balances, reading.balances)) {
      return { tokens: tokens.length, changed: false, failed: reading.failed };
    }
    await context.reactor.execute(documentId, "main", [
      toGlobalAction("SET_TOKEN_BALANCES", {
        blockNumber: reading.blockNumber,
        observedAt: props.now ?? new Date().toISOString(),
        balances: reading.balances,
      }),
    ]);
    return {
      tokens: tokens.length,
      changed: true,
      blockNumber: reading.blockNumber,
      held: reading.balances.filter((b) => b.amount !== "0").length,
      failed: reading.failed,
    };
  },
});
