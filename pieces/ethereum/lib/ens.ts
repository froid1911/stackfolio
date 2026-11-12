/**
 * ENS without an SDK: three eth_call hops against the mainnet registry —
 * reverse resolver for `<addr>.addr.reverse`, its `name()`, then the forward
 * resolver's `addr(node)` as a proof the name really points back. Parsing is
 * separated from the calls so the fixtures in tests exercise the real
 * decoding, not a mock echoing itself.
 */

export const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

/** `resolver(bytes32)` — 0x0178b8bf + the node. */
export function selectorForResolver(node: string): string {
  return `0x0178b8bf${node.replace(/^0x/i, "")}`;
}

/** `name()` — 0x691f3463. */
export function selectorForName(): string {
  return "0x691f3463";
}

/** `addr(bytes32)` — 0x3b3b57de + the node. */
export function selectorForAddr(node: string): string {
  return `0x3b3b57de${node.replace(/^0x/i, "")}`;
}

/** An ABI-encoded address is a 32-byte word; the address is its last 40 hex. */
export function parseAddressFromResult(result: string): string {
  const hex = result.toLowerCase().replace(/^0x/, "");
  if (hex.length < 64) {
    throw new Error(
      `Result "${result.slice(0, 18)}…" is too short to hold an address`,
    );
  }
  return `0x${hex.slice(-40)}`;
}

/** An ABI-encoded `bytes` return value (offset, length, padded payload). */
export function parseBytesString(result: string): string {
  const hex = result.toLowerCase().replace(/^0x/, "");
  if (hex.length < 128) {
    throw new Error("Result too short to hold an ABI-encoded bytes value");
  }
  const offset = Number.parseInt(hex.slice(0, 64), 16) * 2;
  const length = Number.parseInt(hex.slice(offset, offset + 64), 16);
  const data = hex.slice(offset + 64, offset + 64 + length * 2);
  if (data.length !== length * 2) {
    throw new Error("ABI bytes payload is truncated");
  }
  return Buffer.from(data, "hex").toString("utf8");
}

export function isZeroAddress(address: string): boolean {
  return address === ZERO_ADDRESS;
}

export interface EnsCaller {
  ethCall(to: string, data: string): Promise<string>;
}

/** The reverse name for `address`, or null when any hop fails to prove it. */
export async function resolveEnsName(
  caller: EnsCaller,
  address: string,
  namehash: (name: string) => string,
): Promise<string | null> {
  const wanted = address.toLowerCase();
  const reverseNode = namehash(`${wanted.slice(2)}.addr.reverse`);
  const reverseResolver = parseAddressFromResult(
    await caller.ethCall(ENS_REGISTRY, selectorForResolver(reverseNode)),
  );
  if (isZeroAddress(reverseResolver)) return null;
  const name = parseBytesString(
    await caller.ethCall(reverseResolver, selectorForName()),
  );
  if (name === "") return null;
  const node = namehash(name);
  const forwardResolver = parseAddressFromResult(
    await caller.ethCall(ENS_REGISTRY, selectorForResolver(node)),
  );
  if (isZeroAddress(forwardResolver)) return null;
  const resolved = parseAddressFromResult(
    await caller.ethCall(forwardResolver, selectorForAddr(node)),
  );
  return resolved === wanted ? name : null;
}
