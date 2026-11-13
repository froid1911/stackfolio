/**
 * Historical prices for the pin-prices backfill: DefiLlama's daily USD
 * price per token (full history, free, addressed by chain and contract)
 * converted with the ECB's daily USD rate from Frankfurter. CoinGecko's
 * free tier answers only the last 365 days; a ledger reaching back to
 * 2020 needs this path.
 *
 * Failures are kept apart from misses: a request that fails marks its
 * coins `failed` (the caller pins nothing and retries next run); an answer
 * without a price for a day is a definitive miss.
 */

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  llamaBaseUrl?: string;
  fxBaseUrl?: string;
}

/** DefiLlama's chain names, by EVM chain id. */
const LLAMA_CHAIN: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  56: "bsc",
  100: "xdai",
  137: "polygon",
  146: "sonic",
  324: "era",
  5000: "mantle",
  8453: "base",
  42161: "arbitrum",
  43114: "avax",
  59144: "linea",
  534352: "scroll",
};

/** The coin a chain's native slip44:60 identifier stands for. */
const NATIVE_COIN: Record<number, string> = {
  56: "binancecoin",
  100: "xdai",
  137: "polygon-ecosystem-token",
  5000: "mantle",
  43114: "avalanche-2",
};

/**
 * The DefiLlama coin key for a CAIP asset identifier, or the registry's
 * CoinGecko id as "coingecko:<id>"; null when neither names a coin.
 */
export function llamaKey(identifier: string, coingeckoId?: string | null): string | null {
  const token = /^eip155:(\d+)\/erc20:(0x[0-9a-fA-F]+)$/.exec(identifier);
  if (token) {
    const chain = LLAMA_CHAIN[Number(token[1])];
    if (chain) return `${chain}:${token[2].toLowerCase()}`;
  }
  const native = /^eip155:(\d+)\/slip44:60$/.exec(identifier);
  if (native) return `coingecko:${NATIVE_COIN[Number(native[1])] ?? "ethereum"}`;
  if (identifier.startsWith("bip122:")) return "coingecko:bitcoin";
  return coingeckoId ? `coingecko:${coingeckoId}` : null;
}

/** Unix seconds at 12:00 UTC of a "YYYY-MM-DD" day: the daily price's anchor. */
export function noonOf(day: string): number {
  return Date.parse(`${day}T12:00:00Z`) / 1000;
}

/** An answer this far from the anchor belongs to another day. */
const MAX_DRIFT_SECONDS = 12 * 3600;
/** DefiLlama's own confidence below this is not a price we pin. */
const MIN_CONFIDENCE = 0.9;
/** Coin×day pairs per request: keeps the URL short. */
const PER_REQUEST = 60;

/**
 * USD closes for each coin's days, keyed "<coin>|<day>". Coins whose
 * request failed land in `failed`; a day without an answer is simply absent.
 */
export async function fetchUsdCloses(
  requests: Map<string, string[]>,
  opts: FetchOptions = {},
): Promise<{ prices: Map<string, number>; failed: Set<string> }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const base = (opts.llamaBaseUrl ?? "").trim() || "https://coins.llama.fi";
  const prices = new Map<string, number>();
  const failed = new Set<string>();

  // Split into requests of at most PER_REQUEST coin×day pairs.
  const batches: Map<string, string[]>[] = [];
  let current = new Map<string, string[]>();
  let size = 0;
  for (const [coin, days] of requests) {
    for (const day of [...new Set(days)].sort()) {
      if (size === PER_REQUEST) {
        batches.push(current);
        current = new Map();
        size = 0;
      }
      current.set(coin, [...(current.get(coin) ?? []), day]);
      size += 1;
    }
  }
  if (size > 0) batches.push(current);

  for (const batch of batches) {
    const coins = Object.fromEntries([...batch].map(([coin, days]) => [coin, days.map(noonOf)]));
    try {
      const response = await doFetch(
        `${base}/batchHistorical?coins=${encodeURIComponent(JSON.stringify(coins))}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as {
        coins?: Record<string, { prices?: { timestamp?: unknown; price?: unknown; confidence?: unknown }[] }>;
      };
      for (const [coin, days] of batch) {
        const answers = body.coins?.[coin]?.prices ?? [];
        for (const day of days) {
          const anchor = noonOf(day);
          const best = answers
            .filter(
              (a) =>
                typeof a.timestamp === "number" &&
                typeof a.price === "number" &&
                Number.isFinite(a.price) &&
                a.price >= 0 &&
                Math.abs(a.timestamp - anchor) <= MAX_DRIFT_SECONDS &&
                (typeof a.confidence !== "number" || a.confidence >= MIN_CONFIDENCE),
            )
            .sort(
              (a, b) =>
                Math.abs((a.timestamp as number) - anchor) - Math.abs((b.timestamp as number) - anchor),
            )[0];
          if (best) prices.set(`${coin}|${day}`, best.price as number);
        }
      }
    } catch {
      for (const coin of batch.keys()) failed.add(coin);
    }
  }
  return { prices, failed };
}

/** Days are compared as "YYYY-MM-DD" strings; this shifts one by n days. */
function shiftDay(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/**
 * USD→`currency` per day from the ECB reference rates. Weekends and
 * holidays take the previous business day's rate (the window starts a
 * week early so the first day has one); null outside the window. Throws
 * when the rates cannot be read: a run must not price without them.
 */
export async function fetchFxRates(
  currency: string,
  fromDay: string,
  toDay: string,
  opts: FetchOptions = {},
): Promise<(day: string) => number | null> {
  const quote = currency.toUpperCase();
  if (quote === "USD") return () => 1;
  const doFetch = opts.fetchImpl ?? fetch;
  const base = (opts.fxBaseUrl ?? "").trim() || "https://api.frankfurter.dev";
  const start = shiftDay(fromDay, -7);
  let rates: Record<string, Record<string, unknown>> | undefined;
  try {
    const response = await doFetch(`${base}/v1/${start}..${toDay}?from=USD&to=${quote}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) {
      rates = ((await response.json()) as { rates?: Record<string, Record<string, unknown>> }).rates;
    }
  } catch {
    rates = undefined;
  }
  if (!rates) throw new Error(`Could not read USD→${quote} exchange rates`);
  const days = Object.keys(rates).sort();
  const rateOn = new Map(
    days
      .map((d) => [d, rates[d]?.[quote]] as const)
      .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number"),
  );
  return (day: string) => {
    if (day < start || day > toDay) return null;
    let found: number | null = null;
    for (const d of days) {
      if (d > day) break;
      found = rateOn.get(d) ?? found;
    }
    return found;
  };
}
