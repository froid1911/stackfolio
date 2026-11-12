import type { ProtocolManifest } from "../manifest.js";

/**
 * SushiSwap MasterChef (SUSHI farming) — staking semantics for LP-token
 * deposits. Topics recomputed from the MasterChef ABI (verified on
 * Etherscan) and cross-checked against frankp.eth's own chef txs, which
 * emitted Deposit (0x90890809…). The same topic also names yearn-v2 vault
 * deposits (identical signature); the ledger records the emitter, so
 * attribution stays unambiguous.
 */
export const sushiswapChef: ProtocolManifest = {
  id: "sushiswap-chef",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        { name: "chef", address: "0xc2EdaD668740f1aA35E4D8f227fB8E17dcA888Cd", kind: "CORE" },
      ],
      events: [
        {
          topic: "0x90890809c654f11d6e72a28fa60149770a0d11ec6c92319d6ceb2bb0a4ea1a15",
          name: "Deposit",
          semantic: { type: "STAKING", subtype: "DEPOSIT_ASSET" },
          abi: "event Deposit(address indexed user, uint256 indexed pid, uint256 amount)",
        },
        {
          topic: "0xf279e6a1f5e320cca91135676d9cb6e44ca8a08c0b88342bcdb1144f6511b568",
          name: "Withdraw",
          semantic: { type: "STAKING", subtype: "WITHDRAWAL" },
          abi: "event Withdraw(address indexed user, uint256 indexed pid, uint256 amount)",
        },
        {
          topic: "0xbb757047c2b5f3974fe26b7c10f732e7bce710b0952a71082702781e62ae0595",
          name: "EmergencyWithdraw",
          semantic: { type: "STAKING", subtype: "WITHDRAWAL" },
          abi: "event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount)",
        },
      ],
    },
  ],
  plugins: [],
};
