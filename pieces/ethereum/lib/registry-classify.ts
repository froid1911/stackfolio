/**
 * Protocol classification of contract addresses: a token whose address is
 * a POSITION or DEBT contract in an active manifest is not a plain ERC-20,
 * and the registry should say so. Shared by the actions that file tokens
 * onto the asset registry.
 */
import { parseProtocolEntry } from "./manifest.js";
import { globalState } from "./reactor.js";

const PROTOCOL_REGISTRY_TYPE = "stackfolio/protocol-registry";

export type ProtocolClassification = {
  kind: string;
  underlying: string | null;
};

/**
 * The classified addresses of a protocol-registry document as erc20
 * identifiers. A document of any other type classifies nothing.
 */
export function classifyProtocolContracts(doc: {
  header: { documentType: string };
  state: unknown;
}): Map<string, ProtocolClassification> {
  const classified = new Map<string, ProtocolClassification>();
  if (doc.header.documentType !== PROTOCOL_REGISTRY_TYPE) return classified;
  const protocols =
    globalState<{ protocols?: unknown[] }>(doc).protocols ?? [];
  for (const raw of protocols) {
    const manifest = parseProtocolEntry(raw);
    if (!manifest || manifest.status !== "ACTIVE") continue;
    for (const chain of manifest.chains) {
      for (const contract of chain.contracts) {
        if (contract.kind === "CORE") continue;
        classified.set(`eip155:${chain.chainId}/erc20:${contract.address}`, {
          kind: contract.kind,
          underlying: contract.underlying ?? null,
        });
      }
    }
  }
  return classified;
}
