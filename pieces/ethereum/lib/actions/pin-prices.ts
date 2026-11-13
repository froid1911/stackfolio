import { createAction, Property } from "@powerhousedao/pieces-framework";

import { ethereumAuth } from "../auth.js";
import { globalState, toGlobalAction } from "../reactor.js";
import { parseJsonish } from "../jsonish.js";
import { toDecimal } from "../history.js";
import { fetchFxRates, fetchUsdCloses, llamaKey } from "../llama.js";
import { WALLET_ACCOUNT_TYPE } from "./import-events-to-wallet-account.js";

interface LedgerRow {
  id: string;
  sequenceIndex: number;
  timestamp: string;
  asset: string;
  ignored?: boolean;
  valuation?: { source?: string; pinnedAt?: string } | null;
}

/** An UNPRICED pin is retried once it is this old: coverage grows. */
const RETRY_AFTER_MS = 7 * 24 * 3600 * 1000;
/**
 * Pins made before this instant came from a CoinGecko call that read the
 * wrong field and answered UNPRICED for every row; they are retried now.
 */
const REPIN_BEFORE = "2026-11-14T00:00:00.000Z";

export const ethereumPinPricesAction = createAction({
  // DefiLlama and Frankfurter need no key; the piece's connection is
  // still the action's auth, like its siblings.
  auth: ethereumAuth,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "pin-prices",
  displayName: "Pin Historical Prices",
  description:
    "Fill the wallet ledger's missing valuations with daily prices from DefiLlama (full history) in the quote currency at the ECB's daily rate: never-valued rows first, then UNPRICED pins due a retry, oldest first. A day the source has no price for is pinned UNPRICED; a source that does not answer pins nothing, so the next run retries. Manual valuations are never touched.",
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
  },
  async run(context) {
    const props = context.propsValue as typeof context.propsValue & {
      fetchImpl?: typeof fetch;
      /** The run's clock; tests pass one. */
      now?: string;
    };
    const doFetch = props.fetchImpl ?? fetch;
    const now = props.now ?? new Date().toISOString();
    const documentId = props.documentId.trim();
    const document = await context.reactor.get(documentId);
    if (document.header.documentType !== WALLET_ACCOUNT_TYPE) {
      throw new Error(
        `Document ${documentId} is a ${document.header.documentType}, not a ${WALLET_ACCOUNT_TYPE}.`,
      );
    }
    const ledger = globalState<{ ledger?: LedgerRow[] }>(document).ledger ?? [];
    const currency = (props.vsCurrency ?? "EUR").toUpperCase();

    const coingeckoIds = new Map<string, string>();
    if (props.registryJson) {
      try {
        const parsed = parseJsonish(props.registryJson, "registryJson") as {
          assets?: Array<{ identifier?: unknown; coingeckoId?: unknown }>;
        };
        for (const asset of parsed.assets ?? []) {
          if (typeof asset.identifier === "string" && typeof asset.coingeckoId === "string" && asset.coingeckoId !== "") {
            coingeckoIds.set(asset.identifier, asset.coingeckoId);
          }
        }
      } catch {
        // A malformed registry is treated as empty; contract keys cover most rows.
      }
    }

    // Never-valued rows first, then UNPRICED pins due a retry; oldest first.
    const retryable = (row: LedgerRow) => {
      const v = row.valuation;
      if (!v || v.source !== "UNPRICED") return false;
      const at = v.pinnedAt ?? "";
      return at < REPIN_BEFORE || Date.parse(now) - Date.parse(at) >= RETRY_AFTER_MS;
    };
    const byTime = (a: LedgerRow, b: LedgerRow) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id);
    const open = [
      ...ledger.filter((r) => !r.ignored && !r.valuation).sort(byTime),
      ...ledger.filter((r) => !r.ignored && retryable(r)).sort(byTime),
    ].slice(0, props.max);
    if (open.length === 0) return { priced: 0, unpriced: 0, retry: 0 };

    const keyOf = (row: LedgerRow) => llamaKey(row.asset, coingeckoIds.get(row.asset));
    const dayOf = (row: LedgerRow) => row.timestamp.slice(0, 10);
    const requests = new Map<string, string[]>();
    for (const row of open) {
      const key = keyOf(row);
      if (key) requests.set(key, [...(requests.get(key) ?? []), dayOf(row)]);
    }
    const days = open.map(dayOf).sort();
    let rate: (day: string) => number | null;
    try {
      rate = await fetchFxRates(currency, days[0], days.at(-1)!, { fetchImpl: doFetch });
    } catch (error) {
      // Without the day's exchange rate nothing can be priced honestly.
      return { priced: 0, unpriced: 0, retry: open.length, error: (error as Error).message };
    }
    const { prices, failed } = await fetchUsdCloses(requests, { fetchImpl: doFetch });

    let priced = 0;
    let unpriced = 0;
    let retry = 0;
    const events: unknown[] = [];
    for (const row of open) {
      const key = keyOf(row);
      if (key && failed.has(key)) {
        retry += 1; // the source did not answer: pin nothing, next run tries again
        continue;
      }
      const usd = key ? prices.get(`${key}|${dayOf(row)}`) : undefined;
      const fx = rate(dayOf(row));
      const price = usd !== undefined && fx !== null ? toDecimal(usd * fx) : null;
      if (price === null) unpriced += 1;
      else priced += 1;
      events.push({
        id: row.id,
        sequenceIndex: row.sequenceIndex,
        valuation: {
          unit: currency,
          price: price ?? "0",
          source: price === null ? "UNPRICED" : "DEFILLAMA",
          granularity: "DAY",
          pinnedAt: now,
        },
      });
    }

    if (events.length > 0) {
      await context.reactor.execute(documentId, "main", [toGlobalAction("PIN_VALUATIONS", { events })]);
    }
    return { priced, unpriced, retry };
  },
});
