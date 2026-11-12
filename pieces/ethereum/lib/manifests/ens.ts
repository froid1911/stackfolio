import type { ProtocolManifest } from "../manifest.js";

/**
 * ENS: name registration and renewal through the .eth registrars. Names are
 * bought with ETH (the tx's native value), so the rules only tag the tx —
 * `NAME_REGISTRATION`. Addresses and event shapes re-encoded from rotki's
 * ens/constants.py (v1 controller, v2 base registrar implementation,
 * ENS registry for resolver updates).
 */
const NAME_REGISTERED_SINGLE =
  "0xca6abbe9d7f11422cb6ca7629fbf6fe9efb1c621f71ce8f02b9f2a230097404f";
const NAME_REGISTERED_PREMIUM =
  "0x69e37f151eb98a09618ddaa80c8cfaf1ce5996867c489f45b555b412271ebf27";
const NAME_RENEWED =
  "0x3da24c024582931cfaf8267d8ed24d13a82a8068d5bd337d30ec45cea4e506ae";

const events = [
  {
    topic: NAME_REGISTERED_SINGLE,
    name: "NameRegistered",
    semantic: { type: "SPEND", subtype: "NAME_REGISTRATION" } as const,
    abi: "event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint256 cost, uint256 expires)",
  },
  {
    topic: NAME_REGISTERED_PREMIUM,
    name: "NameRegisteredWithPremium",
    semantic: { type: "SPEND", subtype: "NAME_REGISTRATION" } as const,
    abi: "event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint256 baseCost, uint256 premium, uint256 expires)",
  },
  {
    topic: NAME_RENEWED,
    name: "NameRenewed",
    semantic: { type: "SPEND", subtype: "NAME_REGISTRATION" } as const,
    abi: "event NameRenewed(string name, bytes32 indexed label, uint256 cost, uint256 expires)",
  },
];

export const ens: ProtocolManifest = {
  id: "ens",
  status: "ACTIVE",
  chains: [
    {
      chainId: 1,
      contracts: [
        { name: "registrar-controller-v1", address: "0x283Af0B28c62C092C9727F1Ee09c02CA627EB7F5", kind: "CORE" },
        { name: "registrar-controller-v2", address: "0x253553366Da8546fC250F225fe3d25d0C782303b", kind: "CORE" },
        { name: "base-registrar", address: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85", kind: "CORE" },
      ],
      events,
    },
  ],
  plugins: [],
};
