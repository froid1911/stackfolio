import { createAction, Property } from "@powerhousedao/pieces-framework";

import { globalState, toGlobalAction } from "../reactor.js";
import { parseJsonish } from "../jsonish.js";
import { getDailyClose } from "../history.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";

const ETH_IDENTIFIER = "eip155:1/slip44:60";

/** CoinGecko contract-lookup platform per chain, mirroring fetch-prices. */
const CG_PLATFORM: Record<number, string> = {
  1: "ethereum",
  10: "optimistic-ethereum",
  56: "binance-smart-chain",
  137: "polygon-pos",
  42161: "arbitrum-one",
  8453: "base",
  43114: "avalanche",
};

interface LedgerRow {
  id: string;
  sequenceIndex: number;
  timestamp: string;
  asset: string;
  ignored?: boolean;
  valuation?: unknown;
}

interface PinTarget {
  row: LedgerRow;
  day: string;
  coinId: string | null;
}

async function resolveCoinId(
  asset: string,
  registry: Map<string, string>,
  base: string,
  doFetch: typeof fetch,
): Promise<string | null> {
  const known = registry.get(asset);
  if (known) return known;
  if (asset === ETH_IDENTIFIER) return "ethereum";
  const match = /^eip155:(\d+)\/erc20:(0x[0-9a-fA-F]{40})$/.exec(asset);
  if (!match) return null;
  const platform = CG_PLATFORM[Number(match[1])];
  if (!platform) return null;
  try {
    const response = await doFetch(
      `${base}/coins/${platform}/contract/${match[2].toLowerCase()}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as Array<{ id?: unknown }>;
    const first = Array.isArray(body) ? body[0] : undefined;
    return typeof first?.id === "string" && first.id !== ""
      ? first.id
      : null;
  } catch {
    return null;
  }
}

export const ethereumPinPricesAction = createAction({
  // CoinGecko needs no node connection.
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "pin-prices",
  displayName: "Pin Historical Prices",
  description:
    "Fill the wallet ledger's missing valuations with CoinGecko daily closes: oldest unpriced rows first, at most one call per (asset, day); rows CoinGecko cannot price are pinned UNPRICED rather than left ambiguous. Manual valuations are never touched.",
  props: {
    documentId: Property.ShortText({
      displayName: "Wallet account document",
      description: "The stackfolio/wallet-account document to pin onto.",
      required: true,
    }),
    max: Property.Number({
      displayName: "Max rows per run",
      description:
        "Ledger rows to resolve this run, oldest first; the next run continues.",
      required: true,
    }),
    vsCurrency: Property.ShortText({
      displayName: "Quote currency",
      description: "Three-letter code, e.g. EUR. Defaults to EUR.",
      required: false,
      defaultValue: "EUR",
    }),
    registryJson: Property.Json({
      displayName: "Asset registry state (JSON)",
      description:
        "Optional asset-registry global state; its coingeckoId fields map identifiers to CoinGecko ids.",
      required: false,
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
    const doFetch =
      (props as { fetchImpl?: typeof fetch }).fetchImpl ?? fetch;
    const documentId = props.documentId.trim();
    const document = await context.reactor.get(documentId);
    if (document.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(
        `Document ${documentId} is a ${document.header.documentType}, not a ${WALLET_ACCOUNT_TYPE}.`,
      );
    }
    const ledger =
      globalState<{ ledger?: LedgerRow[] }>(document).ledger ?? [];
    const currency = (props.vsCurrency ?? "EUR").toLowerCase();
    const base =
      (props.coingeckoBaseUrl ?? "").trim() ||
      "https://api.coingecko.com/api/v3";

    const registry = new Map<string, string>();
    if (props.registryJson) {
      try {
        const parsed = parseJsonish(
          props.registryJson,
          "registryJson",
        ) as { assets?: Array<{ identifier?: unknown; coingeckoId?: unknown }> };
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
        // A malformed registry is treated as empty; lookup covers it.
      }
    }

    const open = ledger
      .filter((row) => !row.valuation && !row.ignored)
      .sort(
        (a, b) =>
          a.timestamp.localeCompare(b.timestamp) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, props.max);

    const targets: PinTarget[] = [];
    for (const row of open) {
      targets.push({
        row,
        day: row.timestamp.slice(0, 10),
        coinId: null,
      });
    }
    const prices = new Map<string, string | null>();
    for (const target of targets) {
      const key = `${target.row.asset}|${target.day}`;
      if (!prices.has(key)) {
        const coinId = await resolveCoinId(
          target.row.asset,
          registry,
          base,
          doFetch,
        );
        const price = coinId
          ? await getDailyClose(coinId, target.day, currency, {
              baseUrl: base,
              fetchImpl: doFetch,
            })
          : null;
        prices.set(key, price);
      }
    }

    const pinnedAt = new Date().toISOString();
    const unit = currency.toUpperCase();
    const events: unknown[] = [];
    let priced = 0;
    let unpriced = 0;
    for (const target of targets) {
      const price = prices.get(`${target.row.asset}|${target.day}`);
      if (price) priced += 1;
      else unpriced += 1;
      events.push({
        id: target.row.id,
        sequenceIndex: target.row.sequenceIndex,
        valuation: {
          unit,
          price: price ?? "0",
          source: price ? "COINGECKO" : "UNPRICED",
          granularity: "DAY",
          pinnedAt,
        },
      });
    }

    if (events.length > 0) {
      await context.reactor.execute(documentId, "main", [
        toGlobalAction("PIN_VALUATIONS", { events }),
      ]);
    }
    return { priced, unpriced };
  },
});
