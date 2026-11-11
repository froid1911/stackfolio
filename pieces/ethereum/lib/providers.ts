/**
 * Which indexer answers for which chain. Etherscan's free plan covers
 * the first group; the chains it charges for are answered by the
 * Blockscout hosted gateway where that gateway serves them (verified
 * live against the operator's key: OP Mainnet and Gnosis answer, BSC
 * and Avalanche are not Blockscout chains at all).
 *
 * A chain absent from both tables is UNSUPPORTED - the actions say so
 * by name (Base: needs a paid Etherscan or Blockscout Builder plan)
 * instead of importing a partial lie from whichever half-works.
 */
export type ChainProvider = "etherscan" | "blockscout";

const ETHERSCAN_FREE = new Set([
  1, // Ethereum
  137, // Polygon
  42161, // Arbitrum One
  59144, // Linea
  42220, // Celo
  480, // World
  130, // Unichain
  146, // Sonic
  143, // Monad
  80094, // Berachain
  2741, // Abstract
  5000, // Mantle
  252, // Fraxtal
  199, // BitTorrent
  50, // XDC
  4352, // Memecore
  167000, // Taiko
  999, // HyperEVM
  747474, // Katana
  1329, // Sei
  988, // Stable
  9745, // Plasma
  4326, // MegaETH
]);

const BLOCKSCOUT_GATEWAY = new Map<number, string>([
  [10, "OP Mainnet"],
  [100, "Gnosis"],
]);

/** The provider an address's chain should be imported through. */
export function providerForChain(chainId: number): ChainProvider | null {
  if (ETHERSCAN_FREE.has(chainId)) return "etherscan";
  if (BLOCKSCOUT_GATEWAY.has(chainId)) return "blockscout";
  return null;
}

/** Why an unsupported chain is unsupported, named honestly. */
export function unsupportedChainMessage(chainId: number): string {
  const name = NOT_FREE_ON_ETHERSCAN.get(chainId);
  return name
    ? `Chain ${chainId} (${name}) is not on the free Etherscan plan and not served by the Blockscout gateway with this key. Importing it needs a paid plan (Base: Etherscan paid or Blockscout Builder+).`
    : `Chain ${chainId} is not covered by the free Etherscan plan nor the Blockscout gateway - no free import exists for it.`;
}

const NOT_FREE_ON_ETHERSCAN = new Map<number, string>([
  [8453, "Base"],
  [56, "BNB Smart Chain"],
  [43114, "Avalanche C-Chain"],
]);
