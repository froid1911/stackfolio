/**
 * Which indexer answers for which chain. Etherscan's free plan covers
 * the first group; the chains it charges for are answered by the
 * Blockscout hosted gateway where it serves them (OP Mainnet, Gnosis -
 * verified live), and Base/BSC/Avalanche - which Blockscout's plan
 * gates too - by the Ankr multichain API's freemium roster.
 *
 * A chain absent from both tables is UNSUPPORTED - the actions say so
 * by name (Base: needs a paid Etherscan or Blockscout Builder plan)
 * instead of importing a partial lie from whichever half-works.
 */
export type ChainProvider = "etherscan" | "blockscout" | "ankr";

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

const ANKR_ROSTER = new Map<number, string>([
  [8453, "Base"],
  [56, "BNB Smart Chain"],
  [43114, "Avalanche C-Chain"],
]);

/** The provider an address's chain should be imported through. */
export function providerForChain(chainId: number): ChainProvider | null {
  if (ETHERSCAN_FREE.has(chainId)) return "etherscan";
  if (BLOCKSCOUT_GATEWAY.has(chainId)) return "blockscout";
  if (ANKR_ROSTER.has(chainId)) return "ankr";
  return null;
}

/** Why an unsupported chain is unsupported, named honestly. */
export function unsupportedChainMessage(chainId: number): string {
  return `Chain ${chainId} is covered by no free plan we know: Etherscan charges for it, Blockscout does not serve it and Ankr's multichain roster does not list it. No free import exists for it.`;
}
