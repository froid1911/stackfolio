import type { ProtocolManifest } from "../manifest.js";

/**
 * Curve v1 stableswap pools and gauges (mainnet). Event topics recomputed
 * from the verified ABI of pool 0x0ce6a5f… (Etherscan `getsourcecode`) and
 * matched against logs in frankp.eth's own receipts: TokenExchange,
 * AddLiquidity and RemoveLiquidityOne all fired live in his history, and
 * the gauge RewardPaid topic was observed in his Convex-era txs. Multi-coin
 * pools (3pool etc.) emit differently-shaped LP events; their swaps still
 * match here because TokenExchange's shape is identical across the v1
 * pools, and anything unmatched bookkeeps generically.
 */
const POOLS = [
  "0xA2F25D6382B12d1B10e0B461b7Fc6573897A536e",
  "0x7fC77b5c7614e1533320ea6DcC2E61fA00A97144",
  "0x705350c4bCD35c9441419DdD5d2f097d7A55410f",
  "0xa90996896660dECC6e997655e065B23788857849",
  "0x0cE6A5FF5217E38315f87032cF90686C96627CAa",
  "0xfa712eE4788C042e2B7BB55E6cb8ec569C4530c1",
  "0xa5407eAe9ba41422680E2e00537571bcc53EFbfd",
  "0xbbc81d23ea2C3ec7e56d39296F0CBB648873a5d3",
];

// veCRV gauge (frankp's Curve LP was gauged; 0xdcb6a51e… "CurveRewards").
const GAUGES = ["0xdcb6a51ea3ca5d3fd898fd6564757c7aaec3ca92"];

export const curve: ProtocolManifest = {
  id: "curve",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        ...POOLS.map((address, i) => ({ name: `pool-${i}`, address, kind: "CORE" as const })),
        ...GAUGES.map((address, i) => ({ name: `gauge-${i}`, address, kind: "CORE" as const })),
      ],
      events: [
        {
          topic: "0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140",
          name: "TokenExchange",
          semantic: { type: "TRADE", subtype: "NONE" },
          abi: "event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)",
        },
        {
          topic: "0x26f55a85081d24974e85c6c00045d0f0453991e95873f52bff0d21af4079a768",
          name: "AddLiquidity",
          semantic: { type: "SPEND", subtype: "LP_MINT" },
          abi: "event AddLiquidity(address indexed provider, uint256[2] token_amounts, uint256[2] fees, uint256 invariant, uint256 token_supply)",
        },
        {
          topic: "0x5ad056f2e28a8cec232015406b843668c1e36cda598127ec3b8c59b8c72773a0",
          name: "RemoveLiquidityOne",
          semantic: { type: "RECEIVE", subtype: "LP_BURN" },
          abi: "event RemoveLiquidityOne(address indexed provider, uint256 token_amount, uint256 coin_index, uint256 coin_amount)",
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
