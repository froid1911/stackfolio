/**
 * Official airdrop claim contracts, keyed "<chainId>:<lower-cased address>".
 * A receipt from one is an airdrop claim: booked AIRDROP_NON_TAXABLE by
 * default (BMF 10.05.2022 - income only where the recipient gave something
 * in return); a rule or an override changes it. Each address was checked
 * against the claim receipts in the live ledger.
 */
export const KNOWN_AIRDROPS: ReadonlyMap<string, string> = new Map([
  ["1:0x090d4613473dee047c3f2706764f49e0821d256e", "Uniswap UNI airdrop"],
  ["42161:0x67a24ce4321ab3af51c2d0a4801c3e111d88c9d9", "Arbitrum ARB airdrop"],
  ["1:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72", "ENS airdrop"],
  ["1:0x090e53c44e8a9b6b1bca800e881455b921aec420", "ParaSwap PSP airdrop"],
  ["1:0xde3e5a990bce7fc60a6f017e7c4a95fc4939299e", "Gitcoin GTC airdrop"],
]);

/** The airdrop a counterparty pays out, if it is a known claim contract. */
export function airdropDistributor(
  chainId: number | undefined,
  counterparty: string | null,
): string | undefined {
  if (!counterparty) return undefined;
  return KNOWN_AIRDROPS.get(`${chainId ?? 1}:${counterparty.toLowerCase()}`);
}
