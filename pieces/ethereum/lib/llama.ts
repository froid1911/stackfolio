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

/**
 * The coin a contract tracks one to one, for the days DefiLlama has no
 * history for the contract itself: its records of bridged tokens and Aave
 * aTokens begin in 2024-25. Keys are DefiLlama "<chain>:<contract>"; each
 * was checked against DefiLlama's own symbol for the contract.
 */
const CANONICAL: Record<string, string> = {
  // Polygon: bridged majors
  "polygon:0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": "dai",
  "polygon:0x2791bca1f2de4661ed88a30c99a7a9449aa84174": "usd-coin", // USDC.e
  "polygon:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "usd-coin",
  "polygon:0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "tether",
  "polygon:0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": "ethereum", // WETH
  "polygon:0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6": "wrapped-bitcoin",
  "polygon:0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": "matic-network", // WMATIC
  // Polygon: Aave v2 (am*) and v3 (aPol*) aTokens, one to one with the asset
  "polygon:0x27f8d03b3a2196956ed754badc28d73be8830a6e": "dai",
  "polygon:0x1a13f4ca1d028320a707d99520abfefca3998b7f": "usd-coin",
  "polygon:0x28424507fefb6f7f8e9d3860f56504e4e5f5f390": "ethereum",
  "polygon:0x60d55f02a771d515e077c9c2403a1ef324885cec": "tether",
  "polygon:0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4": "matic-network",
  "polygon:0x5c2ed810328349100a66b82b78a1791b101c9d61": "wrapped-bitcoin",
  "polygon:0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8": "ethereum",
  "polygon:0x625e7708f30ca75bfd92586e17077590c60eb4cd": "usd-coin",
  "polygon:0x82e64f49ed5ec1bc6e43dad4fc8af9bb3a2312ee": "dai",
  "polygon:0x6ab707aca953edaefbc4fd23ba73294241490620": "tether",
  "polygon:0x6d80113e533a2c0fe82eabd35f1875dcea89ea97": "matic-network",
  // Arbitrum, Optimism, Base
  "arbitrum:0xff970a61a04b1ca14834a43f5de4533ebddb5cc": "usd-coin", // USDC.e
  "arbitrum:0xaf88d065e77c8cc2239327c5edb3a432268e5831": "usd-coin",
  "arbitrum:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": "tether",
  "arbitrum:0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "ethereum",
  "arbitrum:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": "dai",
  "optimism:0x7f5c764cbc14f9669b88837ca1490cca17c31607": "usd-coin",
  "optimism:0x4200000000000000000000000000000000000006": "ethereum",
  "optimism:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": "dai",
  "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "usd-coin",
  "base:0x4200000000000000000000000000000000000006": "ethereum",
};

/** The coin a native identifier stood for before its current one existed. */
const NATIVE_PREDECESSOR: Record<number, string> = {
  137: "matic-network", // POL from the 2023-24 rename; MATIC before it
};

/**
 * A second DefiLlama key for days the first has no price for: the coin a
 * contract tracks one to one, or a native coin's predecessor. Null when
 * there is none.
 */
export function llamaFallback(identifier: string): string | null {
  const token = /^eip155:(\d+)\/erc20:(0x[0-9a-fA-F]+)$/.exec(identifier);
  if (token) {
    const chain = LLAMA_CHAIN[Number(token[1])];
    const coin = chain ? CANONICAL[`${chain}:${token[2].toLowerCase()}`] : undefined;
    return coin ? `coingecko:${coin}` : null;
  }
  const native = /^eip155:(\d+)\/slip44:60$/.exec(identifier);
  const coin = native ? NATIVE_PREDECESSOR[Number(native[1])] : undefined;
  return coin ? `coingecko:${coin}` : null;
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
