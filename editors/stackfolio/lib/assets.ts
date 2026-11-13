/**
 * Asset trust and display: the rules that keep a portfolio readable when a
 * wallet holds 250 airdropped tokens next to five real ones.
 *
 * Three questions, kept separate on purpose:
 *  - Is this identifier a real asset we can vouch for? (verified)
 *  - Can we put a value on it? (priced)
 *  - Is the ticker itself a spoof? (spam)
 * An asset can be verified and unpriced (no CoinGecko id yet), or unverified
 * but priced (a contract lookup answered). Only spoofs are excluded outright.
 */
import type { Asset } from "./graphql.js";
import { fmtAmount, fmtFiat } from "./format.js";

const CHAINS: Record<number, string> = {
  0: "Bitcoin",
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  100: "Gnosis",
  137: "Polygon",
  146: "Sonic",
  324: "zkSync",
  480: "World",
  5000: "Mantle",
  8453: "Base",
  42161: "Arbitrum",
  42220: "Celo",
  43114: "Avalanche",
  59144: "Linea",
  534352: "Scroll",
  999: "Hyperliquid",
};

export function chainLabel(chainId: number): string {
  return CHAINS[chainId] ?? `chain ${chainId}`;
}

/**
 * The chain an asset lives on: the registry's word first, else the CAIP-2
 * prefix of its identifier — never a default chain for an unknown asset.
 */
export function chainOf(book: Map<string, Asset>, identifier: string): string {
  const registered = book.get(identifier);
  if (registered) return chainLabel(registered.chainId);
  const evm = /^eip155:(\d+)\//.exec(identifier);
  if (evm) return chainLabel(Number(evm[1]));
  if (identifier.startsWith("bip122:")) return "Bitcoin";
  return "unknown chain";
}

/** Characters a ticker may carry: "UNI-V2", "MD+", "yveCRV-DAO", "ETH2x-FLI". */
const TICKER = /^[A-Za-z0-9$._\-+/()]+$/;
/** Printable ASCII: names carry punctuation ("Curve.fi DAI/USDC/USDT/sUSD"). */
const PRINTABLE = /^[\x20-\x7E]+$/;
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/;
const COMBINING = /[\u0300-\u036F]/;
/** Airdrop lures: a link, a call to action, or a domain on a throwaway TLD. */
const LINK = /https?:|www\.|t\.me\//i;
const LURE = /\b(visit|claim|reward|airdrop|voucher|gift)s?\b/i;
const SCAM_DOMAIN = /[a-z0-9-]+\.(com|site|club|xyz|org|net|app|live|top|link|online|vip|cc|info)\b/i;

/**
 * Two impersonation tricks seen in the wild. Look-alikes: mixed-script and
 * invisible characters ("DAІ" with a Cyrillic І, "USDТ" with a Cyrillic Т,
 * zero-width padding). Bait: tickers and names that are adverts ("880$ Visit
 * unibonus.site to claim", "BalancerLP.com"). Project names on .finance and
 * .fi stay legitimate ("yefam.finance", "Curve.fi …").
 */
export function looksSpoofed(asset: Pick<Asset, "symbol" | "name">): boolean {
  const { symbol, name } = asset;
  for (const text of [symbol, name]) {
    if (!text) continue;
    if (INVISIBLE.test(text) || COMBINING.test(text) || !PRINTABLE.test(text)) return true;
    if (LINK.test(text) || LURE.test(text) || SCAM_DOMAIN.test(text)) return true;
  }
  return Boolean(symbol) && !TICKER.test(symbol);
}

/** Native coins, curated entries and CoinGecko-mapped assets are vouched for. */
export function isVerified(asset: Asset): boolean {
  return asset.kind === "NATIVE" || asset.custom || asset.coingeckoId !== null;
}

export type AssetTier = "verified" | "unverified" | "spam";

export interface AssetView {
  asset: Asset;
  tier: AssetTier;
  priced: boolean;
  /** How many registry entries share this exact ticker. */
  collisions: number;
}

export interface AssetBook {
  byId: Map<string, Asset>;
  byTicker: Map<string, number>;
  rows: AssetView[];
}

/** Registry rows with their trust tier, priced flag and ticker collisions. */
export function assetBook(assets: Asset[], priced: Iterable<string>): AssetBook {
  const pricedIds = new Set(priced);
  const byTicker = new Map<string, number>();
  for (const asset of assets) {
    if (!asset.symbol) continue;
    byTicker.set(asset.symbol, (byTicker.get(asset.symbol) ?? 0) + 1);
  }
  const byId = new Map(assets.map((a) => [a.identifier, a]));
  const rows = assets.map((asset) => ({
    asset,
    tier: looksSpoofed(asset) ? "spam" : isVerified(asset) ? "verified" : "unverified",
    priced: pricedIds.has(asset.identifier),
    collisions: byTicker.get(asset.symbol) ?? 1,
  })) satisfies AssetView[];
  return { byId, byTicker, rows };
}

export function tierCounts(rows: AssetView[]): Record<AssetTier, number> {
  const counts = { verified: 0, unverified: 0, spam: 0 };
  for (const row of rows) counts[row.tier] += 1;
  return counts;
}

/** A meaningful quantity: six significant fraction digits, never a raw blob. */
export function formatQuantity(quantity: string | null | undefined): string {
  return fmtAmount(quantity, 0, 6);
}

/** A unit price: sub-unit assets keep their precision, the rest show cents. */
export function formatUnitPrice(price: string | null | undefined): string {
  if (price === null || price === undefined) return "—";
  const n = Number(price);
  if (!Number.isFinite(n)) return "—";
  return fmtFiat(price, Math.abs(n) > 0 && Math.abs(n) < 1 ? 6 : 2);
}

export interface Coverage {
  assets: number;
  pricedAssets: number;
  unpricedAssets: number;
  /** Holdings whose value is unknown; counts rows, not amounts. */
  unpricedRows: number;
  /** Value of the priced rows, if the caller passes them. */
  pricedValue: string | null;
}

export function coverage(
  rows: { asset: string; value: string | null }[],
  total: string | null,
): Coverage {
  const assets = new Set(rows.map((r) => r.asset));
  const unpriced = new Set(
    rows.filter((r) => r.value === null).map((r) => r.asset),
  );
  return {
    assets: assets.size,
    pricedAssets: assets.size - unpriced.size,
    unpricedAssets: unpriced.size,
    unpricedRows: rows.filter((r) => r.value === null).length,
    pricedValue: total,
  };
}

/** Tickers a user should see before identifiers: symbol, else the short id. */
export function symbolOf(book: Map<string, Asset>, identifier: string): string {
  return book.get(identifier)?.symbol || shortIdentifier(identifier);
}

export function nameOf(book: Map<string, Asset>, identifier: string): string {
  return book.get(identifier)?.name || "";
}

export function shortIdentifier(identifier: string): string {
  // A contract address names the asset better than its CAIP namespace;
  // a native coin keeps "slip44:60".
  const tail = identifier.split("/").at(-1) ?? identifier;
  const address = tail.split(":")[1];
  const label = address?.startsWith("0x") ? address : tail;
  return label.length > 18 ? `${label.slice(0, 6)}…${label.slice(-4)}` : label;
}

/** Collisions worth a warning: the same ticker on more than one contract. */
export function ambiguousTicker(view: AssetView): boolean {
  return view.collisions > 1 && view.tier !== "verified";
}

/** Exact sum of decimal strings ("1000.5" + "6000.25" = "7000.75"). */
function sumDecimals(values: string[]): string {
  const parts = values
    .map((v) => /^(-?)(\d+)(?:\.(\d+))?$/.exec(v))
    .filter((m): m is RegExpExecArray => m !== null);
  const scale = parts.reduce((m, p) => Math.max(m, p[3]?.length ?? 0), 0);
  let acc = 0n;
  for (const [, sign, int, frac = ""] of parts) {
    const n = BigInt(int + frac.padEnd(scale, "0"));
    acc += sign === "-" ? -n : n;
  }
  const negative = acc < 0n;
  const digits = (negative ? -acc : acc).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const frac = digits.slice(digits.length - scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/** Aave-style debt receipts ("variableDebtEthUSDT"): liabilities, not assets. */
export function isDebtToken(symbol: string): boolean {
  return /^(variable|stable)Debt[A-Z]/.test(symbol);
}

export interface AssetHolding {
  asset: string;
  quantity: string;
  value: string | null;
}

export interface Allocation<T extends AssetHolding> {
  /** Priced, not spam, biggest first: these make the total. */
  valued: T[];
  /** Not spam, no price: listed with their quantity, never in a total. */
  unpriced: T[];
  /** Spoofed tickers, priced or not: never counted. */
  spam: T[];
  /**
   * Debt receipts. A holding's value is quantity × price, positive, so a
   * debt would inflate the total; until the index nets liabilities they are
   * kept out and listed, and the page says the total is gross of them.
   */
  debt: T[];
  /**
   * Holdings whose ledger nets below zero — impossible for a balance, so
   * an inflow the ledger never recorded (a wrap, a bridge). Kept out of the
   * total and listed rather than subtracted.
   */
  negative: T[];
  /** Sum of `valued`, exact decimal. */
  total: string;
  /** A valued asset's fraction of `total`; null for anything else. */
  share: (identifier: string) => number | null;
  /** Donut slices from the same total: the top `top` plus "Other". */
  slices: { label: string; value: number }[];
}

/**
 * The one place a portfolio's totals are decided: Balances and the
 * Dashboard both draw from it, so the table total, the shares and the
 * donut cannot disagree, and a priced spoof cannot inflate any of them.
 */
export function allocate<T extends AssetHolding>(
  perAsset: T[],
  book: AssetBook,
  top = 8,
): Allocation<T> {
  const tiers = new Map(book.rows.map((r) => [r.asset.identifier, r.tier]));
  const isSpam = (identifier: string) => tiers.get(identifier) === "spam";
  const isDebt = (identifier: string) =>
    !isSpam(identifier) && isDebtToken(symbolOf(book.byId, identifier));
  const isNegative = (a: T) => a.quantity.startsWith("-");
  const counted = (a: T) => !isSpam(a.asset) && !isDebt(a.asset) && !isNegative(a);
  const spam = perAsset.filter((a) => isSpam(a.asset));
  const debt = perAsset.filter((a) => isDebt(a.asset));
  const negative = perAsset.filter((a) => isNegative(a) && !isSpam(a.asset) && !isDebt(a.asset));
  const unpriced = perAsset.filter((a) => a.value === null && counted(a));
  const valued = perAsset
    .filter((a) => a.value !== null && counted(a))
    .sort((a, b) => Number(b.value) - Number(a.value));
  const total = sumDecimals(valued.map((a) => a.value!));
  const totalNumber = Number(total);
  const byId = new Map(valued.map((a) => [a.asset, Number(a.value)]));
  const head = valued.slice(0, top);
  const rest = valued.slice(top).reduce((acc, a) => acc + Number(a.value), 0);
  return {
    valued,
    unpriced,
    spam,
    debt,
    negative,
    total,
    share: (identifier) => {
      const value = byId.get(identifier);
      return value === undefined || totalNumber <= 0 ? null : value / totalNumber;
    },
    slices: [
      ...head.map((a) => ({ label: symbolOf(book.byId, a.asset), value: Number(a.value) })),
      ...(rest > 0 ? [{ label: "Other", value: rest }] : []),
    ],
  };
}
