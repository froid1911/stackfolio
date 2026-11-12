import type { ProtocolManifest } from "../manifest.js";

/**
 * Uniswap v3: the NonfungiblePositionManager per chain (addresses and chain
 * set re-encoded from rotki's UNISWAP_V3_NFT_MANAGER_ADDRESSES) plus the
 * mainnet Universal Router for swaps. The manager's Increase/DecreaseLiquidity
 * topics were verified against live mainnet logs — the real periphery emits
 * (tokenId, liquidity, amount0, amount1), not the older 8-field form.
 * LP positions are NFTs, so decoding alone can't value them: the entry names
 * the `univ3-position-math` plugin that turns liquidity+ticks into underlying
 * amounts for `fetch-positions`.
 */
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

const liquidityEvents = [
  {
    topic: "0x3067048beee31b25b2f1681f88dac838c8bba36af25bfb2b7cf7473a5847e35f",
    name: "IncreaseLiquidity",
    semantic: { type: "INFORMATIONAL", subtype: "LP_MINT" } as const,
    abi: "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  },
  {
    topic: "0x26f6a048ee9138f2c0ce266f322cb99228e8d619ae2bff30c67f8dcf9d2377b4",
    name: "DecreaseLiquidity",
    semantic: { type: "INFORMATIONAL", subtype: "LP_BURN" } as const,
    abi: "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  },
];

const poolSwapEvent = {
  topic: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
  name: "Swap",
  semantic: { type: "TRADE", subtype: "NONE" } as const,
  abi: "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
};

export const uniswapV3: ProtocolManifest = {
  id: "uniswap-v3",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        { name: "positions", address: MANAGER, kind: "POSITION" },
        { name: "universal-router", address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", kind: "CORE" },
      ],
      events: [...liquidityEvents, poolSwapEvent],
    },
    ...[137, 42161, 10, 8453, 56].map((chainId) => ({
      chainId,
      contracts: [
        {
          name: "positions",
          address:
            chainId === 8453
              ? "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1"
              : chainId === 56
                ? "0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613"
                : MANAGER,
          kind: "POSITION" as const,
        },
      ],
      events: [...liquidityEvents, poolSwapEvent],
    })),
  ],
  plugins: ["univ3-position-math"],
};
