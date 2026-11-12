import type { ProtocolManifest } from "../manifest.js";

/**
 * Sky (formerly MakerDAO): USDS savings (sUSDS) and the MKR->SKY / DAI->USDS
 * migration contracts. Conversions are plain ERC-20 Transfers into and out of
 * these contracts, so no event topics are needed — the CORE addresses drive
 * decoding. sUSDS is a POSITION token whose balance accrues yield on-chain.
 * Addresses and their roles re-encoded from rotki's sky/constants.py.
 */
export const sky: ProtocolManifest = {
  id: "sky",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        { name: "dai-to-usds", address: "0x3225737a9Bbb6473CB4a45b7244ACa2BeFdB276A", kind: "CORE" },
        { name: "mkr-to-sky", address: "0xBDcFCA946b6CDd965f99a839e4435Bcdc1bc470B", kind: "CORE" },
        { name: "migration-actions", address: "0xf86141a5657Cf52AEB3E30eBccA5Ad3a8f714B89", kind: "CORE" },
        { name: "psm3-usdc-a", address: "0xf6e72Db5454dd049d0788e411b06CfAF16853042", kind: "CORE" },
        {
          name: "susds",
          address: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
          kind: "POSITION",
          underlying: "eip155:1/erc20:0xdC035D45d973E3EC169d2276DDab16f1e407384F",
        },
      ],
      events: [],
    },
  ],
  plugins: [],
};
