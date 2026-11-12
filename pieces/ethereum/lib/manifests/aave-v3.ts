import type { ProtocolManifest } from "../manifest.js";

/**
 * Aave v3. Pool addresses come from bgd-labs/aave-address-book (the
 * deployment Aave ships) and were verified live with getReservesList on
 * each chain. Mainnet keeps the v3.0 pool too: its frozen reserves still
 * hold funds. Event topics recomputed from the ABI fragments in this file
 * (manifest.test.ts enforces) and cross-checked with on-chain logs.
 */
const MAINNET_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";
const MAINNET_OLD_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

const events = [
  {
    topic: "0x2b627736bca15cd5381dcf80b0bf11fd197d01a037c52b927a881a10fb73ba61",
    name: "Supply",
    semantic: { type: "SPEND", subtype: "DEPOSIT_ASSET" } as const,
    abi: "event Supply(address indexed reserve, address indexed user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  },
  {
    topic: "0x3115d1449a7b732c986cba18244e897a450f61e1bb8d589cd2e69e6c8924f9f7",
    name: "Withdraw",
    semantic: { type: "RECEIVE", subtype: "WITHDRAWAL" } as const,
    abi: "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  },
  {
    topic: "0xb3d084820fb1a9decffb176436bd02558d15fac9b0ddfed8c465bc7359d7dce0",
    name: "Borrow",
    semantic: { type: "RECEIVE", subtype: "BORROW" } as const,
    abi: "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  },
  {
    topic: "0xa534c8dbe71f871f9f3530e97a74601fea17b426cae02e1c5aee42c96c784051",
    name: "Repay",
    semantic: { type: "SPEND", subtype: "REPAY" } as const,
    abi: "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
  },
  {
    topic: "0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286",
    name: "LiquidationCall",
    semantic: { type: "INFORMATIONAL", subtype: "LIQUIDATION" } as const,
    abi: "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
  },
];

/** Pool addresses per chain from the address book; the v3 deployment
 * shares 0x794a… across the old L2s, so it is not "same everywhere". */
const POOLS: Record<number, Array<{ name: string; address: string }>> = {
  1: [
    { name: "pool", address: MAINNET_POOL },
    { name: "pool-v3.0", address: MAINNET_OLD_POOL },
  ],
  10: [{ name: "pool", address: MAINNET_OLD_POOL }],
  56: [{ name: "pool", address: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB" }],
  137: [{ name: "pool", address: MAINNET_OLD_POOL }],
  8453: [{ name: "pool", address: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" }],
  42161: [{ name: "pool", address: MAINNET_OLD_POOL }],
  43114: [{ name: "pool", address: MAINNET_OLD_POOL }],
};

const chains = Object.keys(POOLS)
  .map(Number)
  .map((chainId) => ({
    chainId,
    contracts: POOLS[chainId].map((entry) => ({
      name: entry.name,
      address: entry.address,
      kind: "CORE" as const,
    })),
    events,
  }));

export const aaveV3: ProtocolManifest = {
  id: "aave-v3",
  status: "ACTIVE",
  chains,
  plugins: [],
};
