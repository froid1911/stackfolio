/**
 * Staging for the accounting index: parse the resulting states the reactor
 * hands over into index rows, and compute the hashes that guard the fold.
 * The processor only ever reads states, never documents; these parses are
 * the single place ledger JSON turns into rows.
 */
import type { AssetRow, AddressRow, EventRow } from "./schema.js";
import type { FoldEvent } from "./fold.js";
import { unwrapState } from "../portfolio-index/rows.js";
import { overrideKey } from "../shared/categories.js";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/** One wallet-account document's ledger as index rows. */
export function walletEventRows(
  documentId: string,
  state: unknown,
): { wallet: string; rows: EventRow[] } | null {
  const global = asRecord(unwrapState(state));
  const address = global ? str(global.address) : null;
  if (!global || !address) return null;
  const wallet = address.toLowerCase();
  const ledger = Array.isArray(global.ledger) ? global.ledger : [];
  const rows: EventRow[] = [];
  for (const raw of ledger) {
    const event = asRecord(raw);
    if (!event) continue;
    const id = str(event.id);
    const asset = str(event.asset);
    const amount = str(event.amount);
    const timestamp = str(event.timestamp);
    const type = str(event.type);
    if (!id || !asset || !amount || !timestamp || !type) continue;
    const valuation = asRecord(event.valuation);
    rows.push({
      document_id: documentId,
      wallet,
      event_id: id,
      event_identifier: str(event.eventIdentifier) ?? id,
      sequence_index:
        typeof event.sequenceIndex === "number" ? event.sequenceIndex : 0,
      timestamp,
      type,
      subtype: str(event.subtype) ?? "NONE",
      asset,
      amount,
      counterparty: str(event.counterparty),
      ignored: event.ignored === true,
      price: valuation ? str(valuation.price) : null,
      price_unit: valuation ? str(valuation.unit) : null,
      price_source: valuation ? str(valuation.source) : null,
    });
  }
  return { wallet, rows };
}

/** The portfolio's address book: the wallet set self-moves must find. */
export function portfolioAddressRows(
  documentId: string,
  state: unknown,
): AddressRow[] {
  const global = asRecord(unwrapState(state));
  const addresses =
    global && Array.isArray(global.addresses) ? global.addresses : [];
  const rows: AddressRow[] = [];
  for (const raw of addresses) {
    const entry = asRecord(raw);
    const address = entry ? str(entry.address) : null;
    if (!address) continue;
    rows.push({ document_id: documentId, address: address.toLowerCase() });
  }
  return rows;
}

/** The assets the portfolio ignores (spam, unlisted tokens). */
export function portfolioIgnoredAssetRows(
  documentId: string,
  state: unknown,
): { document_id: string; asset: string }[] {
  const global = asRecord(unwrapState(state));
  const assets = global && Array.isArray(global.ignoredAssets) ? global.ignoredAssets : [];
  return [...new Set(assets.filter((a): a is string => typeof a === "string" && a !== ""))].map(
    (asset) => ({ document_id: documentId, asset }),
  );
}

/** The portfolio's tax category rules (in order) and overrides, as JSON. */
export function portfolioCategoryRows(
  documentId: string,
  state: unknown,
): {
  rules: { document_id: string; id: string; position: number; rule: string }[];
  overrides: { document_id: string; key: string; override: string }[];
} {
  const global = asRecord(unwrapState(state));
  const list = (field: string): unknown[] =>
    global && Array.isArray(global[field]) ? global[field] : [];
  const rules = list("categoryRules")
    .map((raw) => asRecord(raw))
    .filter((rule): rule is Record<string, unknown> => typeof rule?.id === "string")
    .map((rule, position) => ({
      document_id: documentId,
      id: rule.id as string,
      position,
      rule: JSON.stringify(rule),
    }));
  const overrides = list("categoryOverrides")
    .map((raw) => asRecord(raw))
    .filter(
      (o): o is Record<string, unknown> =>
        typeof o?.wallet === "string" && typeof o.eventId === "string",
    )
    .map((o) => ({
      document_id: documentId,
      key: overrideKey(o.wallet as string, o.eventId as string, Number(o.sequenceIndex)),
      override: JSON.stringify({
        category: o.category,
        giftCost: o.giftCost ?? null,
        giftAcquiredAt: o.giftAcquiredAt ?? null,
      }),
    }));
  return { rules, overrides };
}

/** Asset decimals from the registry; without them nothing is priceable. */
export function registryAssetRows(
  documentId: string,
  state: unknown,
): AssetRow[] {
  const global = asRecord(unwrapState(state));
  const assets = global && Array.isArray(global.assets) ? global.assets : [];
  const rows: AssetRow[] = [];
  for (const raw of assets) {
    const asset = asRecord(raw);
    const identifier = asset ? str(asset.identifier) : null;
    if (!identifier || typeof asset?.decimals !== "number") continue;
    rows.push({
      document_id: documentId,
      asset: identifier,
      decimals: asset.decimals,
    });
  }
  return rows;
}

export const rowKey = (row: EventRow): string =>
  `${row.document_id}|${row.event_id}`;

/** FNV-1a over the fold inputs; cheap, stable, good enough to notice an
 * edit anywhere in the ledger. */
export function fnv1a(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Deterministic hash of everything the fold reads: rows, wallets, decimals. */
export function foldInputHash(
  events: Array<{
    wallet: string;
    event_id: string;
    event_identifier: string;
    sequence_index: number;
    timestamp: string;
    type: string;
    subtype: string;
    asset: string;
    amount: string;
    counterparty: string | null;
    ignored: boolean;
    price: string | null;
    price_unit: string | null;
    price_source: string | null;
  }>,
  addresses: string[],
  decimals: Array<[string, number]>,
  ignoredAssets: string[] = [],
  categories = "",
): { inputHash: string; ctxHash: string } {
  const ordered = [...events].sort(
    (a, b) =>
      a.wallet.localeCompare(b.wallet) ||
      a.timestamp.localeCompare(b.timestamp) ||
      a.event_identifier.localeCompare(b.event_identifier) ||
      a.sequence_index - b.sequence_index ||
      a.event_id.localeCompare(b.event_id),
  );
  const input = ordered
    .map(
      (row) =>
        `${row.wallet}\u0000${row.event_id}\u0000${row.event_identifier}\u0000${row.sequence_index}\u0000${row.timestamp}\u0000${row.type}\u0000${row.subtype}\u0000${row.asset}\u0000${row.amount}\u0000${row.counterparty ?? ""}\u0000${row.ignored}\u0000${row.price ?? ""}\u0000${row.price_unit ?? ""}\u0000${row.price_source ?? ""}`,
    )
    .join("\n");
  const context = [
    [...addresses].sort().join(","),
    [...decimals].sort((a, b) => a[0].localeCompare(b[0])).map(([asset, decimals]) => `${asset}:${decimals}`).join(","),
    // Appended only when present: an unchanged context hashes as before.
    ...(ignoredAssets.length > 0 ? [[...ignoredAssets].sort().join(",")] : []),
    ...(categories ? [categories] : []),
  ].join("|");
  return { inputHash: fnv1a(input), ctxHash: fnv1a(context) };
}

/** Index rows back into fold events. */
export function toFoldEvents(
  rows: Array<Omit<EventRow, "document_id">>,
  ignoredAssets: ReadonlySet<string> = new Set(),
): FoldEvent[] {
  return rows.map((row) => ({
    wallet: row.wallet,
    id: row.event_id,
    eventIdentifier: row.event_identifier,
    sequenceIndex: row.sequence_index,
    timestamp: row.timestamp,
    type: row.type,
    subtype: row.subtype,
    asset: row.asset,
    amount: row.amount,
    counterparty: row.counterparty,
    // An ignored asset's events stay out of the books like ignored rows.
    ignored: row.ignored || ignoredAssets.has(row.asset),
    valuation:
      row.price != null && row.price_unit != null && row.price_source != null
        ? {
            unit: row.price_unit,
            price: row.price,
            source: row.price_source,
          }
        : null,
  }));
}
