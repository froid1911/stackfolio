import { createAction, Property } from "@powerhousedao/pieces-framework";
import { parseJsonish } from "../jsonish.js";

const ETH_IDENTIFIER = "eip155:1/slip44:60";

/** CoinGecko platform slugs for the chains whose ERC-20s we price. */
const CG_PLATFORM: Record<number, string> = {
  1: "ethereum",
  10: "optimistic-ethereum",
  56: "binance-smart-chain",
  137: "polygon-pos",
  42161: "arbitrum-one",
  8453: "base",
  43114: "avalanche",
};

function platformFor(identifier: string): string | null {
  const m = /^eip155:(\d+)\/erc20:0x[0-9a-fA-F]{40}$/.exec(identifier);
  if (!m) return null;
  return CG_PLATFORM[Number(m[1])] ?? null;
}

function contractOf(identifier: string): string {
  const m = /^eip155:\d+\/erc20:(0x[0-9a-fA-F]{40})$/.exec(identifier);
  return (m ? m[1] : "").toLowerCase();
}

interface RegistryAsset {
  identifier?: unknown;
  coingeckoId?: unknown;
}

/**
 * CoinGecko prices for asset identifiers. Registry-provided `coingeckoId`s
 * win; ERC-20s without one are looked up by contract address; the mainnet
 * coin falls back to the `ethereum` id. Anything that cannot be priced is
 * reported in `error` — the action never guesses a number.
 */
export const ethereumFetchPricesAction = createAction({
  // CoinGecko needs no node connection.
  requireAuth: false,
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-prices",
  displayName: "Fetch Prices",
  description:
    "Ask CoinGecko for the price of each asset identifier in the portfolio's currency: registry coingeckoIds first, contract-address lookup for unmapped ERC-20s, the ethereum id for mainnet Ether. Assets CoinGecko does not know are named in `error`, never invented.",
  props: {
    assetIdentifiersJson: Property.LongText({
      displayName: "Asset identifiers (JSON array)",
      description:
        'A JSON array of CAIP-style identifiers, e.g. ["eip155:1/slip44:60","eip155:1/erc20:0xa0b8…"].',
      required: true,
    }),
    hour: Property.ShortText({
      displayName: "Hour (ISO timestamp)",
      description:
        "Bucket the prices are recorded at, e.g. 2026-11-11T10:00:00.000Z. Passed through to the price book.",
      required: true,
    }),
    registryJson: Property.Json({
      displayName: "Asset registry state (JSON)",
      description:
        "The asset-registry document's global state ({{steps.registry.output.state.global}}); its coingeckoId fields map identifiers to CoinGecko ids.",
      required: false,
    }),
    vsCurrency: Property.ShortText({
      displayName: "Quote currency",
      description: "Three-letter code, e.g. EUR. Defaults to EUR.",
      required: false,
      defaultValue: "EUR",
    }),
    coingeckoBaseUrl: Property.ShortText({
      displayName: "CoinGecko base URL",
      description: "Change only to point at a proxy or paid endpoint.",
      required: false,
      defaultValue: "https://api.coingecko.com/api/v3",
    }),
  },
  async run(context) {
    const props = context.propsValue;
    let identifiers: unknown;
    try {
      identifiers = JSON.parse(props.assetIdentifiersJson);
    } catch {
      throw new Error(
        "assetIdentifiersJson must be a JSON array of asset identifiers.",
      );
    }
    if (!Array.isArray(identifiers)) {
      throw new Error("assetIdentifiersJson must be a JSON array.");
    }

    const registry = new Map<string, string>();
    if (props.registryJson) {
      try {
        const parsed = parseJsonish(
          props.registryJson,
          "registryJson",
        ) as { assets?: RegistryAsset[] };
        for (const asset of parsed.assets ?? []) {
          if (
            typeof asset.identifier === "string" &&
            typeof asset.coingeckoId === "string" &&
            asset.coingeckoId !== ""
          ) {
            registry.set(asset.identifier, asset.coingeckoId);
          }
        }
      } catch {
        // A malformed registry is treated as empty; address lookup covers it.
      }
    }

    const currency = (props.vsCurrency ?? "EUR").toLowerCase();
    const base = (props.coingeckoBaseUrl ?? "").trim() ||
      "https://api.coingecko.com/api/v3";
    const ids = new Map<string, string>();
    const addresses: Array<{ asset: string; address: string; platform: string }> = [];
    const unmapped: string[] = [];

    for (const entry of identifiers) {
      // The holdings step feeds rows; hand-written payloads may carry bare
      // identifiers. Both name the asset, so both are honoured.
      const identifier =
        typeof entry === "string"
          ? entry
          : entry &&
            typeof entry === "object" &&
            typeof (entry as { asset?: unknown }).asset === "string"
            ? (entry as { asset: string }).asset
            : null;
      if (identifier === null) continue;
      const known = registry.get(identifier);
      if (known) {
        ids.set(identifier, known);
      } else if (identifier === ETH_IDENTIFIER) {
        ids.set(identifier, "ethereum");
      } else if (platformFor(identifier) !== null) {
        addresses.push({
          asset: identifier,
          address: contractOf(identifier),
          platform: platformFor(identifier) as string,
        });
      } else {
        unmapped.push(identifier);
      }
    }

    const errors: string[] = unmapped.map(
      (asset) => `no CoinGecko mapping for ${asset}`,
    );
    const prices: Array<{
      asset: string;
      price: string;
      source: string;
      hour: string;
    }> = [];

    const get = async (url: string): Promise<Record<string, unknown>> => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`CoinGecko answered HTTP ${response.status}`);
      }
      return (await response.json()) as Record<string, unknown>;
    };

    const collect = (
      fetched: Record<string, unknown>,
      entries: Array<{ asset: string; key: string }>,
    ) => {
      for (const { asset, key } of entries) {
        const entry = fetched[key.toLowerCase()];
        const price =
          typeof entry === "object" && entry !== null
            ? (entry as Record<string, unknown>)[currency]
            : undefined;
        if (typeof price === "number" || typeof price === "string") {
          prices.push({
            asset,
            price: String(price),
            source: "COINGECKO",
            hour: props.hour,
          });
        } else {
          errors.push(`CoinGecko has no ${currency} price for ${asset}`);
        }
      }
    };

    if (ids.size > 0) {
      try {
        const fetched = await get(
          `${base}/simple/price?ids=${[...ids.values()].join(",")}&vs_currencies=${currency}`,
        );
        collect(
          fetched,
          [...ids.entries()].map(([asset, key]) => ({ asset, key })),
        );
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    // Contract lookups go to CoinGecko per platform: the slug names the
    // chain, so tokens on Base, BSC or Avalanche price like mainnet ones.
    const byPlatform = new Map<string, typeof addresses>();
    for (const entry of addresses) {
      const list = byPlatform.get(entry.platform) ?? [];
      if (!byPlatform.has(entry.platform)) byPlatform.set(entry.platform, list);
      list.push(entry);
    }
    for (const [platform, group] of byPlatform) {
      // CoinGecko takes at most 20 contract addresses per call; a longer
      // list is a 400 for the whole group, so the walk of a busy wallet
      // (hundreds of tokens) has to go in slices.
      for (let from = 0; from < group.length; from += 20) {
        const chunk = group.slice(from, from + 20);
        try {
          const fetched = await get(
            `${base}/simple/token_price/${platform}?contract_addresses=${chunk
              .map((a) => a.address)
              .join(",")}&vs_currencies=${currency}`,
          );
          collect(
            fetched,
            chunk.map((a) => ({ asset: a.asset, key: a.address })),
          );
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }

    return { prices, error: errors.length > 0 ? errors.join("; ") : null };
  },
});
