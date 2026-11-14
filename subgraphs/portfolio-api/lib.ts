import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  namehash,
} from "viem";

/**
 * The ids of the drive's files: the only documents whose rows a query may
 * return. The processor's namespace holds rows from every drive, so the
 * tables alone do not scope to one. Returns null when the drive is not
 * there or the caller may not read it.
 */
export async function driveFileIds(
  subgraph: BaseSubgraph,
  driveId: string,
  ctx: Context,
): Promise<string[] | null> {
  const handle = await subgraph.assertCanRead(driveId, ctx);
  const drive = (await ctx.clients.read.get(
    handle.fetchIdentifier,
  )) as DocumentDriveDocument | null;
  if (!drive) return null;
  // A document id passed where a drive belongs gets this far; it names no files.
  const nodes = (drive.state.global as { nodes?: unknown } | undefined)?.nodes;
  if (!Array.isArray(nodes)) return [];
  const ids: string[] = [];
  for (const node of nodes as Array<Record<string, unknown>>) {
    if (node.kind === "file" && typeof node.id === "string") ids.push(node.id);
  }
  return ids;
}

/**
 * Forward ENS lookup through the caller's own JSON-RPC node: two plain
 * eth_calls - root registry's resolver(name), then the resolver's
 * addr(name, 60). viem's getEnsAddress is NOT used on purpose: it calls the
 * Universal Resolver's `resolveWithGateways`, which reverted on any node
 * whose state predates the 2025 resolver upgrade. These two calls have
 * worked since 2017. CCIP-only names answer null; that is honest - this
 * node cannot answer them without a gateway.
 */
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const ETH_COIN_TYPE = 60n;

const registryAbi = [
  {
    inputs: [{ internalType: "bytes32", name: "node", type: "bytes32" }],
    name: "resolver",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const resolverAbi = [
  {
    inputs: [
      { internalType: "bytes32", name: "node", type: "bytes32" },
      { internalType: "uint256", name: "coinType", type: "uint256" },
    ],
    name: "addr",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** The address behind `name` on `rpcUrl`; null when it has none there. */
export async function forwardEnsAddress(
  rpcUrl: string,
  name: string,
): Promise<`0x${string}` | null> {
  if (!/^https?:\/\//i.test(rpcUrl)) {
    throw new Error(`rpcUrl must be an http(s) url, got "${rpcUrl}"`);
  }
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: 8000 }) });
  const node = namehash(name);
  const registryRes = await client.call({
    to: ENS_REGISTRY,
    data: encodeFunctionData({
      abi: registryAbi,
      functionName: "resolver",
      args: [node],
    }),
  });
  if (!registryRes.data) return null;
  const resolver = decodeFunctionResult({
    abi: registryAbi,
    functionName: "resolver",
    data: registryRes.data,
  });
  if (resolver === "0x0000000000000000000000000000000000000000") return null;
  const addrRes = await client.call({
    to: resolver,
    data: encodeFunctionData({
      abi: resolverAbi,
      functionName: "addr",
      args: [node, ETH_COIN_TYPE],
    }),
  });
  if (!addrRes.data) return null;
  const raw = decodeFunctionResult({
    abi: resolverAbi,
    functionName: "addr",
    data: addrRes.data,
  });
  // PublicResolver hands back the bare 20 bytes; a 32-byte word carries
  // the address right-aligned in its last 20.
  const body = raw.slice(2);
  if (body.length === 40) return `0x${body}`;
  if (body.length >= 64) return `0x${body.slice(24, 64)}`;
  return null;
}

/** Parse a plain decimal string (the formatScaled column format) into an
 * integer scaled by `scale` digits. `"0.0000002"` at scale 8 -> 20n. */
function parseScaled(value: string, scale: number): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  // At scale 0 a fractional string has no exact integer reading; the
  // caller must see null, not the truncated whole part.
  if (fraction.length > scale) return null;
  const digits = whole + fraction.padEnd(scale, "0");
  const scaled = BigInt(digits);
  return sign === "-" ? -scaled : scaled;
}

/**
 * A lot's stored unit cost is the per-RAW-unit price as a decimal scaled
 * by 1e8 (e.g. "0.0000002"); clients want the price of one WHOLE unit
 * (registry decimals), so scale by 10^decimals and present 8 decimals. An
 * unparseable cost or an asset with no registered decimals crosses as the
 * stored string rather than a guess.
 */
export function unitCostPerWhole(
  unitCost: string,
  decimals: number | undefined,
): string {
  if (decimals === undefined) return unitCost;
  const scaled = parseScaled(unitCost, 8);
  if (scaled === null) return unitCost;
  const shift = BigInt(decimals) - 8n;
  const whole =
    shift >= 0n ? scaled * 10n ** shift : scaled / 10n ** -shift;
  const sign = whole < 0n ? "-" : "";
  const digits = (whole < 0n ? -whole : whole)
    .toString()
    .padStart(9, "0");
  return `${sign}${digits.slice(0, -8)}.${digits.slice(-8)}`;
}

// ---- holdings: read-time fold of the ledger into a balances matrix ----

/** One ledger event as the fold needs it. */
export interface HoldingsEventRow {
  asset: string;
  /** The wallet (address as stored, lower-case). */
  address: string;
  /** Raw token units, unsigned decimal string; `type` carries direction. */
  amount: string;
  ignored: boolean;
  /** The ledger event type (RECEIVE, SPEND, STAKING, TRADE, …). */
  type: string;
}

/**
 * How each event type moves a wallet's balance — the same table as
 * pieces/ethereum's holdings-from-ledger, which folds the snapshot total.
 * Types not listed (TRADE, TRANSFER, MIGRATE, INFORMATIONAL) do not.
 */
const SIGN: Partial<Record<string, 1n | -1n>> = {
  RECEIVE: 1n,
  STAKING: 1n, // beacon withdrawals land in the wallet
  SPEND: -1n,
};

/** A balance read from the chain, not folded from events. */
export interface ObservedBalance {
  asset: string;
  address: string;
  /** Raw token units. */
  amount: string;
}

export interface HoldingsInput {
  events: HoldingsEventRow[];
  /**
   * Observed balances (native coin per account). Each replaces the ledger
   * net for its (asset, wallet): native transfers are in the ledger too,
   * and counting both would double them.
   */
  balances?: ObservedBalance[];
  /** Registry decimals per asset; a missing entry leaves quantity raw. */
  decimals: Record<string, number>;
  /** Latest price per WHOLE unit, 8-decimal text. */
  prices: Record<string, string>;
  /** Portfolio price overrides; they win over `prices`. */
  overrides: Record<string, string>;
}

export interface HoldingsRow {
  asset: string;
  wallet: string;
  /** Token units as decimals allow (registry-less assets: raw units). */
  quantity: string;
  /** Fiat value at the priced unit, 8-decimal text trimmed; null when
   * the asset is unpriced or unregistered — never a guess. */
  value: string | null;
}

const VALUE_SCALE = 8;

/** Trim a scaled decimal of trailing zeros ("1.50000000" -> "1.5", "2" stays). */
function trimZeros(text: string): string {
  if (!text.includes(".")) return text;
  return text.replace(/\.?0+$/, "");
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/** An account row's stored token reading as observed balances. */
export function tokenBalancesOf(
  address: string,
  json: string | null,
): { asset: string; address: string; amount: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (b): b is { asset: string; amount: string } =>
          typeof b === "object" &&
          b !== null &&
          typeof (b as { asset?: unknown }).asset === "string" &&
          typeof (b as { amount?: unknown }).amount === "string",
      )
      .map((b) => ({ asset: b.asset, address, amount: b.amount }));
  } catch {
    return [];
  }
}

/**
 * Fold the drive's ledger events into (asset, wallet) holdings: ignored
 * events drop, each type signs its unsigned amount (SIGN), nets per pair
 * fold exactly in raw units, observed balances replace their pair's net,
 * zero nets drop,
 * quantity renders at registry decimals, and value multiplies the priced
 * unit (override first). Unpriced or unregistered assets carry null
 * values — the view shows them, the totals do not count them.
 */
export function holdingsFromRows(input: HoldingsInput): HoldingsRow[] {
  const nets = new Map<string, { raw: bigint; asset: string; wallet: string }>();
  const keyOf = (asset: string, wallet: string) => `${asset}\u0000${wallet}`;
  const observed = new Set(
    (input.balances ?? []).map((b) => keyOf(b.asset, b.address)),
  );
  for (const event of input.events) {
    if (event.ignored) continue;
    const sign = SIGN[event.type];
    if (!sign) continue;
    const key = keyOf(event.asset, event.address);
    if (observed.has(key)) continue;
    const amount = parseScaled(event.amount, 0);
    if (amount === null) continue;
    const net = nets.get(key);
    if (net) net.raw += amount * sign;
    else nets.set(key, { raw: amount * sign, asset: event.asset, wallet: event.address });
  }
  for (const balance of input.balances ?? []) {
    const amount = parseScaled(balance.amount, 0);
    if (amount === null) continue;
    nets.set(keyOf(balance.asset, balance.address), {
      raw: amount,
      asset: balance.asset,
      wallet: balance.address,
    });
  }

  const rows: HoldingsRow[] = [];
  for (const { raw, asset, wallet } of nets.values()) {
    if (raw === 0n) continue;
    const decimals = input.decimals[asset];
    const price = input.overrides[asset] ?? input.prices[asset];
    const quantity =
      decimals === undefined ? raw.toString() : trimZeros(formatScaledLocal(raw, decimals));
    let value: string | null = null;
    if (decimals !== undefined && price !== undefined) {
      const unit = parseScaled(price, VALUE_SCALE);
      if (unit !== null) {
        // value = raw / 10^decimals * price  (scaled arithmetic, exact)
        const scaled = (unit * raw) / pow10(decimals);
        value = trimZeros(formatScaledLocal(scaled, VALUE_SCALE));
      }
    }
    rows.push({ asset, wallet, quantity, value });
  }
  rows.sort((a, b) => a.asset.localeCompare(b.asset) || a.wallet.localeCompare(b.wallet));
  return rows;
}

/** formatScaled for this module (no pieces dependency in the subgraph). */
function formatScaledLocal(scaled: bigint, scale: number): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale) || "0";
  const fraction = digits.slice(-scale);
  const sign = negative ? "-" : "";
  return scale === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

export interface AssetTotal {
  asset: string;
  quantity: string;
  /** null when the asset carries no valued row. */
  value: string | null;
}

export interface AccountTotal {
  wallet: string;
  value: string;
}

export interface BalancesTotals {
  perAsset: AssetTotal[];
  perAccount: AccountTotal[];
  total: string;
}

/**
 * Pivot holdings rows into per-asset and per-account totals plus the
 * grand total, all in exact decimal arithmetic on the 8-decimal value
 * strings (never float). Quantity sums need equal decimals per asset —
 * rows carry token units at the registry's decimals, so they share scale.
 */
export function buildBalances(rows: HoldingsRow[]): BalancesTotals {
  const scaleOf = (text: string): number => {
    const dot = text.indexOf(".");
    return dot < 0 ? 0 : text.length - dot - 1;
  };
  const sum = (values: string[]): string => {
    const scale = values.reduce((m, v) => Math.max(m, scaleOf(v)), 8);
    let acc = 0n;
    for (const v of values) {
      // Raw unit strings can exceed 2^53; Number(v)*10^scale would round.
      const parsed = parseScaled(v, scale);
      // An unparseable value (exponent form, junk) must not silently
      // drop: it crosses through when it is alone.
      if (parsed === null) return values.length === 1 ? v : "0";
      acc += parsed;
    }
    return trimZeros(formatScaledLocal(acc, scale));
  };

  const byAsset = new Map<string, HoldingsRow[]>();
  const byWallet = new Map<string, string[]>();
  for (const row of rows) {
    const assetRows = byAsset.get(row.asset);
    if (assetRows) assetRows.push(row);
    else byAsset.set(row.asset, [row]);
    if (row.value !== null) {
      const values = byWallet.get(row.wallet);
      if (values) values.push(row.value);
      else byWallet.set(row.wallet, [row.value]);
    }
  }

  const perAsset: AssetTotal[] = [...byAsset.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([asset, assetRows]) => ({
      asset,
      // Quantities mix renderings: registry decimals give "2", a
      // registry-less asset gives raw units — one scale would truncate
      // the fractional row. The per-asset scale is the widest.
      quantity: sum(assetRows.map((r) => r.quantity)),
      value: assetRows.every((r) => r.value === null)
        ? null
        : sum(assetRows.filter((r) => r.value !== null).map((r) => r.value as string)),
    }));
  const perAccount: AccountTotal[] = [...byWallet.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([wallet, values]) => ({ wallet, value: sum(values) }));
  const total =
    perAccount.length === 0 ? "0" : sum(perAccount.map((a) => a.value));
  return { perAsset, perAccount, total };
}

/**
 * One answer per asset: the newest. A drive can hold more than one price
 * document (a re-created book, a second portfolio), and `prices_latest` is
 * keyed per document, so the same asset can carry several "latest" rows.
 * Sorted by asset.
 */
export function newestPrices<T extends { asset: string; fetchedAt: string | Date }>(
  rows: T[],
): T[] {
  const time = (row: T) => new Date(row.fetchedAt).getTime();
  const newest = new Map<string, T>();
  for (const row of rows) {
    const held = newest.get(row.asset);
    if (!held || time(row) > time(held)) newest.set(row.asset, row);
  }
  return [...newest.values()].sort((a, b) => a.asset.localeCompare(b.asset));
}

export interface EventValuation {
  eventId: string;
  sequenceIndex: number;
  price: string | null;
  priceUnit: string | null;
  priceSource: string | null;
}

/**
 * The books' price per event leg, merged onto ledger rows (the two live in
 * different index namespaces, so this is a join in code). An UNPRICED
 * marker or a missing price both read as "no price": null throughout.
 */
export function attachValuations<T extends { eventId: string; sequenceIndex: number }>(
  rows: T[],
  valuations: EventValuation[],
): (T & Omit<EventValuation, "eventId" | "sequenceIndex">)[] {
  const byLeg = new Map(valuations.map((v) => [`${v.eventId}\u0000${v.sequenceIndex}`, v]));
  return rows.map((row) => {
    const v = byLeg.get(`${row.eventId}\u0000${row.sequenceIndex}`);
    const priced = v && v.price !== null && v.priceSource !== "UNPRICED";
    return {
      ...row,
      price: priced ? v.price : null,
      priceUnit: priced ? v.priceUnit : null,
      priceSource: priced ? v.priceSource : null,
    };
  });
}

/**
 * Why the books could not value a leg, merged onto ledger rows: "value"
 * (the leg has no price; pricing it fixes it) wins over "basis" (no cost
 * behind a disposal; an earlier acquisition needs a price). null: no gap.
 */
export function attachGaps<T extends { eventId: string; sequenceIndex: number }>(
  rows: T[],
  gaps: { eventId: string; sequenceIndex: number; reason: string }[],
): (T & { priceGap: "value" | "basis" | null })[] {
  const byLeg = new Map<string, "value" | "basis">();
  for (const g of gaps) {
    const key = `${g.eventId}\u0000${g.sequenceIndex}`;
    if (g.reason === "value") byLeg.set(key, "value");
    else if (g.reason === "basis" && !byLeg.has(key)) byLeg.set(key, "basis");
  }
  return rows.map((row) => ({
    ...row,
    priceGap: byLeg.get(`${row.eventId}\u0000${row.sequenceIndex}`) ?? null,
  }));
}
