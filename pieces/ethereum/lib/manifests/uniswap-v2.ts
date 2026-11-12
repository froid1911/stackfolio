import type { ProtocolManifest } from "../manifest.js";

/**
 * Uniswap v2: pairs are user-launched, so decoding keys off the canonical
 * router (mainnet) and the universal Pair Swap event, whose topic is keccak
 * of the ABI fragment below (enforced by manifest.test.ts).
 *
 * LP mints/burns fire on the pair contracts themselves. The router never
 * appears in those txs, so the manifest carries the pair addresses observed
 * in portfolio history (frankp.eth ledger) — the launch-time way to cover
 * LP positions without a pair-registry plugin.
 */
const PAIRS_OBSERVED = [
  "0x0d4a11d5EEaaC28EC3F61d100daF4D40471f1852", // WETH/USDT
  "0x81fBEF4704776Cc5BBa0A5DF3A90056d2C6900b3",
  "0x87fEbfb3AC5791034Fd5eF1A615e9d9627c2665D",
  "0xa478c2975Ab1e8A892eb69681F51A7B7Ae33E114", // DAI/WETH
  "0xae461ca67b15DC8DC81Cc6a08985DF6A1a9AB8d5",
  "0xf64AF01a14c31164ff7381cF966df6f2B4CB349f",
];

export const uniswapV2: ProtocolManifest = {
  id: "uniswap-v2",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        { name: "router", address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", kind: "CORE" },
        ...PAIRS_OBSERVED.map((address, i) => ({
          name: `pair-${i}`,
          address,
          kind: "CORE" as const,
        })),
      ],
      events: [
        {
          topic: "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822",
          name: "Swap",
          semantic: { type: "TRADE", subtype: "NONE" },
          abi: "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
        },
        {
          topic: "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f",
          name: "Mint",
          semantic: { type: "SPEND", subtype: "LP_MINT" },
          abi: "event Mint(address indexed sender, uint amount0, uint amount1)",
        },
        {
          topic: "0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496",
          name: "Burn",
          semantic: { type: "RECEIVE", subtype: "LP_BURN" },
          abi: "event Burn(address indexed sender, uint amount0, uint amount1, address indexed to)",
        },
      ],
    },
  ],
  plugins: [],
};
