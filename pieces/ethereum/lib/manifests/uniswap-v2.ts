import type { ProtocolManifest } from "../manifest.js";

/**
 * Uniswap v2: pairs are user-launched, so decoding keys off the canonical
 * router (mainnet) and the universal Pair Swap event, whose topic is keccak
 * of the ABI fragment below (enforced by manifest.test.ts).
 */
export const uniswapV2: ProtocolManifest = {
  id: "uniswap-v2",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        { name: "router", address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", kind: "CORE" },
      ],
      events: [
        {
          topic: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
          name: "Swap",
          semantic: { type: "TRADE", subtype: "NONE" },
          abi: "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
        },
      ],
    },
  ],
  plugins: [],
};
