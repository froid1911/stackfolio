import {
  decodeFunctionResult,
  encodeFunctionData,
  namehash,
  type PublicClient,
} from "viem";

/**
 * Forward ENS lookup without viem's UniversalResolver path: it calls
 * `resolveWithGateways`, which only exists on the resolver deployment from
 * 2025 on, and reverts on any node whose state predates that upgrade. The
 * two plain calls below - registry.resolver(name), resolver.addr(name, 60) -
 * have worked since 2017 and cover the on-chain names this wizard cares
 * about. CCIP-only names resolve to null here; the user types the address.
 */
/** The root ENS registry; it answers resolver queries for .eth names. */
const MAINNET_ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const ETH_COIN_TYPE = 60n;

const registryAbi = [
  {
    inputs: [{ internalType: "bytes32", name: "node", type: "bytes32" }],
    name: "resolver",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const resolverAbi = [
  {
    inputs: [
      { internalType: "bytes32", name: "node", type: "bytes32" },
      { internalType: "uint256", name: "coinType", type: "uint256" },
    ],
    name: "addr",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** The address behind `name`, or null when it has none on this node. */
export async function forwardEnsAddress(
  client: PublicClient,
  name: string,
  registry: `0x${string}` = MAINNET_ENS_REGISTRY,
): Promise<`0x${string}` | null> {
  const node = namehash(name);
  const resolverRes = await client.call({
    to: registry,
    data: encodeFunctionData({
      abi: registryAbi,
      functionName: "resolver",
      args: [node],
    }),
  });
  if (!resolverRes.data) return null;
  const resolver = decodeFunctionResult({
    abi: registryAbi,
    functionName: "resolver",
    data: resolverRes.data,
  });
  if (resolver === "0x0000000000000000000000000000000000000000") return null;
  const addrRes = await client.call({
    to: resolver,
    data: encodeFunctionData({
      abi: resolverAbi,
      functionName: "addr",
      args: [node, ETH_COIN_TYPE],
    }),
  });
  if (!addrRes.data) return null;
  const raw = decodeFunctionResult({
    abi: resolverAbi,
    functionName: "addr",
    data: addrRes.data,
  });
  // PublicResolver hands back the bare 20 bytes; a 32-byte word carries the
  // address right-aligned in the last 20.
  const body = raw.slice(2);
  if (body.length === 40) return `0x${body}`;
  if (body.length >= 64) return `0x${body.slice(24, 64)}`;
  return null;
}
