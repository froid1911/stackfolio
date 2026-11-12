import { createAction, Property } from "@powerhousedao/pieces-framework";
import { ethereumAuth } from "../auth.js";
import { authProps, createClientBundle } from "../client.js";
import { knownCoingeckoId } from "../known-tokens.js";
import { parseJsonish } from "../jsonish.js";
import {
  classifyProtocolContracts,
  type ProtocolClassification,
} from "../registry-classify.js";
import { globalState, toGlobalAction } from "../reactor.js";
import {
  readDecimals,
  readString,
  SELECTOR_NAME,
  SELECTOR_SYMBOL,
} from "./fetch-token-metadata.js";
import { ASSET_REGISTRY_TYPE, NATIVE_CHAINS } from "./import-tokens-to-registry.js";

const ASSET_ID = /^eip155:(\d+)\/(slip44:60|erc20:(0x[0-9a-fA-F]{40}))$/;

/** The asset identifiers inside a holdings step's output, which may be the
 * whole `{ holdings: [...] }` object, an array of rows, or an array of
 * bare identifiers. Duplicates collapse. */
function heldAssets(parsed: unknown): string[] {
  const rows = Array.isArray(parsed)
    ? parsed
    : (parsed as { holdings?: unknown } | null)?.holdings ?? [];
  const out = new Set<string>();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row === "string") out.add(row);
    else if (
      row &&
      typeof row === "object" &&
      typeof (row as { asset?: unknown }).asset === "string"
    ) {
      out.add((row as { asset: string }).asset);
    }
  }
  return [...out];
}

/**
 * The registry gap-closer: whatever the ledger holds but the registry has
 * never heard of gets named. ERC-20 metadata comes off the contracts
 * themselves, natives from the built-in chain table - so an unregistered
 * coin stops being an unnamed, unpriceable line in the holdings the day
 * it first arrives.
 */
export const ethereumRegisterMissingAssetsAction = createAction({
  auth: ethereumAuth,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "register-missing-assets",
  displayName: "Register Missing Assets",
  description:
    "Read a holdings step's output, find the asset identifiers the asset registry does not have, and register them: ERC-20s with symbol/name/decimals read from the contract (fallback TKN-<hex> and 18), natives from the built-in per-chain table. Protocol-registry manifests classify POSITION and DEBT contracts. Assets of other chains (Bitcoin) are left to the registry's own entries.",
  props: {
    assetRegistryDocumentId: Property.ShortText({
      displayName: "Asset registry document id",
      required: true,
    }),
    holdingsJson: Property.Json({
      displayName: "Holdings (JSON)",
      description:
        "The holdings step's output ({{steps.holdings.output}}); its asset identifiers are checked against the registry.",
      required: true,
    }),
    addedAt: Property.ShortText({
      displayName: "Added at (ISO timestamp)",
      required: true,
    }),
    protocolRegistryDocumentId: Property.ShortText({
      displayName: "Protocol registry document id",
      description:
        "Optional stackfolio/protocol-registry document; new tokens whose address is a POSITION or DEBT contract register with that kind and underlying.",
      required: false,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    const assets = heldAssets(parseJsonish(p.holdingsJson, "holdingsJson"));

    const doc = await context.reactor.get(p.assetRegistryDocumentId);
    if (doc.header.documentType !== ASSET_REGISTRY_TYPE) {
      throw new Error(
        `Document ${p.assetRegistryDocumentId} is a ${doc.header.documentType}, not ${ASSET_REGISTRY_TYPE}.`,
      );
    }
    const held = new Set(
      (
        globalState<{ assets?: Array<{ identifier?: unknown }> }>(doc)
          .assets ?? []
      )
        .map((asset) => asset.identifier)
        .filter((identifier): identifier is string =>
          typeof identifier === "string",
        ),
    );
    const missing = assets.filter((identifier) => !held.has(identifier));
    if (missing.length === 0) return { registered: 0 };

    let classified = new Map<string, ProtocolClassification>();
    if (p.protocolRegistryDocumentId) {
      classified = classifyProtocolContracts(
        await context.reactor.get(p.protocolRegistryDocumentId),
      );
    }

    const clients = createClientBundle(authProps(context.auth));
    const actions = [];
    for (const identifier of missing) {
      const match = ASSET_ID.exec(identifier);
      if (!match) continue;
      const chainId = Number(match[1]);
      if (match[2] === "slip44:60") {
        const known = NATIVE_CHAINS[chainId];
        actions.push(
          toGlobalAction("REGISTER_ASSET", {
            id: `native-${chainId}`,
            identifier,
            symbol: known?.symbol ?? "NATIVE",
            name: known?.name ?? `Chain ${chainId} native`,
            decimals: 18,
            kind: "NATIVE",
            chainId,
            coingeckoId: known?.coingeckoId ?? null,
            custom: false,
            addedAt: p.addedAt,
          }),
        );
        continue;
      }
      const token = match[3].toLowerCase();
      const fallback = `TKN-${token.slice(2, 8)}`;
      const ethCall = (to: string, data: string) =>
        clients.ethCall(to, data);
      const symbol =
        (await readString(ethCall, token, SELECTOR_SYMBOL)) ?? fallback;
      const name = (await readString(ethCall, token, SELECTOR_NAME)) ?? symbol;
      const decimals = await readDecimals(ethCall, token);
      const classification = classified.get(identifier);
      actions.push(
        toGlobalAction("REGISTER_ASSET", {
          id: identifier,
          identifier,
          symbol,
          name,
          decimals,
          kind: classification?.kind ?? "ERC20",
          chainId,
          // A well-known token prices through its built-in CoinGecko id
          // instead of the rate-limited address route; a wrong id would
          // misprice a real balance, so the table only holds certainties.
          coingeckoId: knownCoingeckoId(identifier) ?? null,
          underlying: classification?.underlying ?? null,
          custom: false,
          addedAt: p.addedAt,
        }),
      );
    }
    if (actions.length > 0) {
      await context.reactor.execute(
        p.assetRegistryDocumentId,
        "main",
        actions,
      );
    }
    return { registered: actions.length };
  },
});
