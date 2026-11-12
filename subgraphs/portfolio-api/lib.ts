import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  namehash,
} from "viem";

/**
 * The ids of the drive's files: the only documents whose rows a query may
 * return. The processor's namespace holds rows from every drive, so the
 * tables alone do not scope to one. Returns null when the drive is not
 * there or the caller may not read it.
 */
export async function driveFileIds(
  subgraph: BaseSubgraph,
  driveId: string,
  ctx: Context,
): Promise<string[] | null> {
  const handle = await subgraph.assertCanRead(driveId, ctx);
  const drive = (await ctx.clients.read.get(
    handle.fetchIdentifier,
  )) as DocumentDriveDocument | null;
  if (!drive) return null;
  // A document id passed where a drive belongs gets this far; it names no files.
  const nodes = (drive.state.global as { nodes?: unknown } | undefined)?.nodes;
  if (!Array.isArray(nodes)) return [];
  const ids: string[] = [];
  for (const node of nodes as Array<Record<string, unknown>>) {
    if (node.kind === "file" && typeof node.id === "string") ids.push(node.id);
  }
  return ids;
}

/**
 * Forward ENS lookup through the caller's own JSON-RPC node: two plain
 * eth_calls - root registry's resolver(name), then the resolver's
 * addr(name, 60). viem's getEnsAddress is NOT used on purpose: it calls the
 * Universal Resolver's `resolveWithGateways`, which reverted on any node
 * whose state predates the 2025 resolver upgrade. These two calls have
 * worked since 2017. CCIP-only names answer null; that is honest - this
 * node cannot answer them without a gateway.
 */
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
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

/** The address behind `name` on `rpcUrl`; null when it has none there. */
export async function forwardEnsAddress(
  rpcUrl: string,
  name: string,
): Promise<`0x${string}` | null> {
  if (!/^https?:\/\//i.test(rpcUrl)) {
    throw new Error(`rpcUrl must be an http(s) url, got "${rpcUrl}"`);
  }
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 8000 }) });
  const node = namehash(name);
  const registryRes = await client.call({
    to: ENS_REGISTRY,
    data: encodeFunctionData({
      abi: registryAbi,
      functionName: "resolver",
      args: [node],
    }),
  });
  if (!registryRes.data) return null;
  const resolver = decodeFunctionResult({
    abi: registryAbi,
    functionName: "resolver",
    data: registryRes.data,
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
  // PublicResolver hands back the bare 20 bytes; a 32-byte word carries
  // the address right-aligned in its last 20.
  const body = raw.slice(2);
  if (body.length === 40) return `0x${body}`;
  if (body.length >= 64) return `0x${body.slice(24, 64)}`;
  return null;
}
