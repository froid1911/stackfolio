import type { ProtocolManifest } from "../manifest.js";

/**
 * Convex reward pools (cvxCRV staking, 0xcf50b810…, "cvxRewardPool"):
 * Stake → staked, Withdraw → unstaked. Topics recomputed from the pool ABI
 * (verified on Etherscan) — Withdrawn(address,uint256) (0x7084f547…) fired
 * live in frankp.eth's receipts.
 */
export const convex: ProtocolManifest = {
  id: "convex",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        { name: "cvxcrv-pool", address: "0xCF50b810E57AC33B91DCf525C6DDd9881b139332", kind: "CORE" },
      ],
      events: [
        {
          topic: "0x9e71bc8eea02a63969f509818f2dafb9254532904319f9dbda79b67bd34a5f3d",
          name: "Staked",
          semantic: { type: "STAKING", subtype: "DEPOSIT_ASSET" },
          abi: "event Staked(address indexed user, uint256 indexed amount)",
        },
        {
          topic: "0x7084f5476618d8e60b11ef0d7d3f06914655adb8793e28ff7f018d4c76d505d5",
          name: "Withdrawn",
          semantic: { type: "STAKING", subtype: "WITHDRAWAL" },
          abi: "event Withdrawn(address indexed user, uint256 indexed amount)",
        },
        {
          topic: "0xe2403640ba68fed3a2f88b7557551d1993f84b99bb10ff833f0cf8db0c5e0486",
          name: "RewardPaid",
          semantic: { type: "RECEIVE", subtype: "YIELD" },
          abi: "event RewardPaid(address indexed user, uint256 reward)",
        },
      ],
    },
  ],
  plugins: [],
};
