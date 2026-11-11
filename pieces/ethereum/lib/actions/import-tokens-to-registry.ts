import { createAction, Property } from "@powerhousedao/pieces-framework";
import { globalState, toGlobalAction } from "../reactor.js";

export const ASSET_REGISTRY_TYPE = "stackfolio/asset-registry";

interface TokenRow {
  identifier: string;
  symbol: string;
  name: string;
  decimals: number;
  kind: string;
  chainId: number;
}

/** Boundary narrowing for a wire row from the metadata step; the registry
 * reducer validates everything else. */
function asTokenRow(raw: unknown): TokenRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row: Partial<TokenRow> = raw;
  if (typeof row.identifier !== "string") return null;
  const symbol = typeof row.symbol === "string" ? row.symbol : "TKN";
  return {
    identifier: row.identifier,
    symbol,
    name: typeof row.name === "string" ? row.name : symbol,
    decimals: typeof row.decimals === "number" ? row.decimals : 18,
    kind: typeof row.kind === "string" ? row.kind : "ERC20",
    chainId: typeof row.chainId === "number" ? row.chainId : 1,
  };
}

export function nativeIdentifier(chainId: number): string {
  return `eip155:${chainId}/slip44:60`;
}

/**
 * File scanned tokens (and each chain's native coin) onto the asset
 * registry, registering only identifiers the registry does not have yet.
 * The registry rejects duplicates, so planning before dispatching is not
 * politeness but protocol.
 */
export const ethereumImportTokensToRegistryAction = createAction({
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "import-tokens-to-registry",
  displayName: "Import Tokens into Asset Registry",
  description:
    "Register token metadata rows on the stackfolio/asset-registry document, skipping identifiers already registered, and make sure each chain's native asset (eip155:<chain>/slip44:60) exists so balances of the native coin can be denominated.",
  props: {
    registryDocumentId: Property.ShortText({
      displayName: "Asset registry document id",
      required: true,
    }),
    tokensJson: Property.LongText({
      displayName: "Token metadata (JSON)",
      description:
        "The JSON array from the metadata step ({{steps.metadata.output.tokens}}).",
      required: true,
    }),
    addedAt: Property.ShortText({
      displayName: "Added at (ISO timestamp)",
      required: true,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(p.tokensJson);
    } catch {
      throw new Error("tokensJson must be a JSON array.");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("tokensJson must be a JSON array.");
    }

    const doc = await context.reactor.get(p.registryDocumentId);
    if (doc.header.documentType !== ASSET_REGISTRY_TYPE) {
      throw new Error(
        `Document ${p.registryDocumentId} is a ${doc.header.documentType}, not ${ASSET_REGISTRY_TYPE}.`,
      );
    }
    const assets: Array<{ identifier: string }> =
      globalState<{ assets?: Array<{ identifier: string }> }>(doc).assets ?? [];
    const held = new Set(assets.map((asset) => asset.identifier));

    const actions = [];
    const tokens: TokenRow[] = [];
    for (const raw of parsed) {
      const token = asTokenRow(raw);
      if (token) tokens.push(token);
    }
    const chains = new Set<number>();
    for (const token of tokens) {
      chains.add(token.chainId);
    }
    for (const chainId of chains) {
      const identifier = nativeIdentifier(chainId);
      if (held.has(identifier)) continue;
      held.add(identifier);
      actions.push(
        toGlobalAction("REGISTER_ASSET", {
          id: `native-${chainId}`,
          identifier,
          symbol: "ETH",
          name: chainId === 1 ? "Ether" : `Chain ${chainId} native`,
          decimals: 18,
          kind: "NATIVE",
          chainId,
          coingeckoId: chainId === 1 ? "ethereum" : null,
          custom: false,
          addedAt: p.addedAt,
        }),
      );
    }
    for (const token of tokens) {
      if (held.has(token.identifier)) continue;
      held.add(token.identifier);
      actions.push(
        toGlobalAction("REGISTER_ASSET", {
          id: token.identifier,
          identifier: token.identifier,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          kind: token.kind,
          chainId: token.chainId,
          coingeckoId: null,
          custom: false,
          addedAt: p.addedAt,
        }),
      );
    }
    if (actions.length > 0) {
      await context.reactor.execute(p.registryDocumentId, "main", actions);
    }
    return { registered: actions.length };
  },
});
