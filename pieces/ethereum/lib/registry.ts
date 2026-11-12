import { globalState } from "./reactor.js";
import { manifestForChain, type ChainIndex } from "./manifest.js";

export const PROTOCOL_REGISTRY_TYPE = "stackfolio/protocol-registry";

/**
 * The chain's registry index from a protocol-registry document: absent,
 * wrong-typed or unreadable documents answer `undefined` so the import
 * falls back to generic-only rows - registry enrichment must never fail a
 * page, it can only improve one.
 */
export function registryIndexFor(
  registryDocument: { header: { documentType: string }; state: unknown } | null,
  chainId: number,
): ChainIndex | undefined {
  if (!registryDocument) return undefined;
  if (registryDocument.header.documentType !== PROTOCOL_REGISTRY_TYPE) {
    return undefined;
  }
  const protocols =
    globalState<{ protocols?: unknown[] }>(registryDocument).protocols ?? [];
  const index = manifestForChain(protocols, chainId);
  return index.protocols.length > 0 ? index : undefined;
}
