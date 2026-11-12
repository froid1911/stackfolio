import type { ProtocolManifest } from "../manifest.js";

/**
 * Balancer v1 (BPool). Topics recomputed from the canonical Balancer v1
 * event signatures (viem `toEventHash`) and verified against frankp.eth's
 * ZapOut receipt: LOG_EXIT (0xe74c9155…) fired live on BPool 0x6b988742….
 * LOG_JOIN/LOG_SWAP keep their canonical topics — same deployment — though
 * his sampled history contained no join or swap on a BPool. BPool addresses
 * are the pools observed in his ledger; pools outside his history don't
 * decode yet (no factory enumeration plugin).
 */
const BPOOLS = [
  "0x4304aE5fd14cEC2299caee4E9A4AfbEDd046d612",
  "0x6b9887422e2A4AE11577f59Ea9C01a6C998752E2",
  "0x6bD73b07d48626Aa4915709C57087cB098546Ae6",
  "0x815F8eF4863451f4FAF34FBc860034812e7377d9",
  "0x95F0Aa355f4251291e6413DD0174488F0Ca8D2Db",
  "0x9DDE0b1d39D0D2c6589cDe1bFEd3542d2a3c5B11",
  "0xD7067192dF19C415eE35Cc86708020eAF924CD75",
];

// Balancer_ZapIn/Out helper contracts seen in his tx history.
const ZAPS = [
  "0x95521a9D38f4F65B961e726931837679c03D19CD", // ZapIn_General_V2_4
  "0x00D0f137B51692d0AC708BDE7b367A373865Cffe", // ZapOut_General_V2_2
];

export const balancerV1: ProtocolManifest = {
  id: "balancer-v1",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        ...BPOOLS.map((address, i) => ({ name: `bpool-${i}`, address, kind: "CORE" as const })),
        ...ZAPS.map((address, i) => ({ name: `zap-${i}`, address, kind: "CORE" as const })),
      ],
      events: [
        {
          topic: "0x908fb5ee8f16c6bc9bc3690973819f32a4d4b10188134543c88706e0e1d43378",
          name: "LOG_SWAP",
          semantic: { type: "TRADE", subtype: "NONE" },
          abi: "event LOG_SWAP(address indexed caller, address indexed tokenIn, address indexed tokenOut, uint256 tokenAmountIn, uint256 tokenAmountOut)",
        },
        {
          topic: "0x63982df10efd8dfaaaa0fcc7f50b2d93b7cba26ccc48adee2873220d485dc39a",
          name: "LOG_JOIN",
          semantic: { type: "SPEND", subtype: "LP_MINT" },
          abi: "event LOG_JOIN(address indexed caller, address indexed tokenIn, uint256 tokenAmountIn)",
        },
        {
          topic: "0xe74c91552b64c2e2e7bd255639e004e693bd3e1d01cc33e65610b86afcc1ffed",
          name: "LOG_EXIT",
          semantic: { type: "RECEIVE", subtype: "LP_BURN" },
          abi: "event LOG_EXIT(address indexed caller, address indexed tokenOut, uint256 tokenAmountOut)",
        },
      ],
    },
  ],
  plugins: [],
};
