/**
 * Daily-close price history from CoinGecko, the pin-prices oracle. One call
 * per (coin, day); every failure shape - 404, rate limit, junk body - is a
 * null close, never a thrown error: a price we cannot prove is a price we
 * do not pin.
 */

/** CoinGecko `vs_currency` codes, lowercase ("eur", "usd"). */
export type PricePlatform = string;

/** Fixed-notation decimal for a float; CoinGecko's exponent forms ("1e-8")
 * are not decimals and the ledger's amount validator would reject them. */
export function toDecimal(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = Math.abs(value) < 1e18 ? value.toFixed(12) : String(value);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  return trimmed === "" || trimmed === "-0" ? "0" : trimmed;
}

export interface HistoryOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * The closing price of `coinGeckoId` on a UTC calendar day
 * ("YYYY-MM-DD") in the given currency; null when CoinGecko does not
 * confirm one.
 */
export async function getDailyClose(
  coinGeckoId: string,
  dateUtc: string,
  platform: PricePlatform,
  opts: HistoryOptions = {},
): Promise<string | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const base =
    (opts.baseUrl ?? "").trim() || "https://api.coingecko.com/api/v3";
  const currency = platform.toLowerCase();
  const [year, month, day] = dateUtc.split("-");
  if (!year || !month || !day) return null;
  try {
    const response = await doFetch(
      `${base}/coins/${encodeURIComponent(coinGeckoId)}/history?date=${day}-${month}-${year}&vs_currency=${currency}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    const price = body[currency];
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      return null;
    }
    return toDecimal(price);
  } catch {
    return null;
  }
}
