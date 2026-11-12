/**
 * Search candidates for the command palette: pure, data-in hits-out, so
 * the palette component only renders and navigates. Hits carry a route
 * target ({ page, detail }) — detail is the slug of the thing (address,
 * asset identifier, event id), resolved back by the shell's route logic.
 */
import { slug } from "./slugs.js";
import { NAV_ENTRIES, type NavEntry, type Page } from "../nav.js";

export type SearchKind = "page" | "account" | "asset" | "event";

export interface SearchHit {
  kind: SearchKind;
  label: string;
  sub?: string;
  to: { page: Page; detail?: string };
}

export interface SearchAccount {
  address: string;
  ensName?: string | null;
  label?: string | null;
}

export interface SearchAsset {
  identifier: string;
  symbol: string;
  name: string;
}

export interface SearchEvent {
  eventId: string;
  eventIdentifier: string;
  timestamp: string;
  type: string;
  asset: string;
  amount: string;
}

export interface SearchData {
  accounts: SearchAccount[];
  assets: SearchAsset[];
  events: SearchEvent[];
}

const CAP_PER_KIND = 8;

/** Case-insensitive substring; "" matches nothing (callers handle ""). */
const contains = (needle: string, haystack: string | null | undefined): boolean =>
  haystack !== null && haystack !== undefined && haystack.toLowerCase().includes(needle);

/**
 * Starts-with ranks above a mid-string hit, and word-start (the "a" in
 * "D**a**shboard") below both: a search palette should not fire on any
 * letter inside a word, but a word's initial letters are its name.
 */
const starts = (needle: string, haystack: string | null | undefined): number => {
  if (!haystack) return 2;
  const value = haystack.toLowerCase();
  if (value.startsWith(needle)) return 0;
  const at = value.indexOf(needle);
  if (at > 0 && !/[\s(]/.test(value[at - 1])) return 2;
  return 1;
};

/**
 * Build the palette's hits for `query`: nav pages always (empty query →
 * pages only, in table order); accounts, assets and events when the data
 * is loaded. Each kind caps at 8, starts-with first, and within that the
 * data's own order holds (stable sort).
 */
export function buildHits(
  query: string,
  data: SearchData,
  entries: readonly NavEntry[] = NAV_ENTRIES,
): SearchHit[] {
  const needle = query.trim().toLowerCase();

  const pageHits = entries
    .map((e, at) => ({ e, at }))
    .filter(({ e }) => !needle || contains(needle, e.label))
    .map(({ e, at }) => ({ rank: starts(needle, e.label), at, hit: { kind: "page" as const, label: e.label, to: { page: e.page } } }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((w) => w.hit);
  if (!needle) return pageHits;

  const accountHits = data.accounts
    .map((a): { rank: number; hit: SearchHit } | null => {
      const label = a.ensName || a.label || a.address;
      if (!contains(needle, a.address) && !contains(needle, a.ensName) && !contains(needle, a.label))
        return null;
      const subParts = [a.ensName ? a.label : null, a.ensName ? null : a.label].filter(Boolean) as string[];
      // Rank on every field the query may have matched: ensName is the
      // label, but a query typed against the address or the plain label
      // deserves the same starts-with precedence.
      const rank = Math.min(
        starts(needle, label),
        starts(needle, a.ensName),
        starts(needle, a.label),
        starts(needle, a.address),
      );
      return {
        rank,
        hit: {
          kind: "account" as const,
          label,
          ...(subParts.length > 0 ? { sub: subParts.join(" · ") } : {}),
          to: { page: "balances" as Page, detail: slug(a.address) },
        },
      };
    })
    .filter((w): w is { rank: number; hit: SearchHit } => w !== null)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, CAP_PER_KIND)
    .map((w) => w.hit);

  const assetHits = data.assets
    .filter((a) => contains(needle, a.symbol) || contains(needle, a.name) || contains(needle, a.identifier))
    .map((a) => ({
      rank: Math.min(starts(needle, a.name), starts(needle, a.symbol), starts(needle, a.identifier)),
      hit: {
        kind: "asset" as const,
        label: a.name,
        sub: a.symbol,
        to: { page: "assets" as Page, detail: slug(a.identifier) },
      },
    }))
    .sort((x, y) => x.rank - y.rank)
    .slice(0, CAP_PER_KIND)
    .map((w) => w.hit);

  const eventHits = data.events
    .filter((e) => contains(needle, e.eventIdentifier) || contains(needle, e.type) || contains(needle, e.asset))
    .map((e) => ({
      rank: Math.min(starts(needle, e.eventIdentifier), starts(needle, e.type), starts(needle, e.asset)),
      hit: {
        kind: "event" as const,
        label: e.eventIdentifier,
        sub: e.type,
        to: { page: "history" as Page, detail: slug(e.eventId) },
      },
    }))
    .sort((x, y) => x.rank - y.rank)
    .slice(0, CAP_PER_KIND)
    .map((w) => w.hit);

  return [...pageHits, ...accountHits, ...assetHits, ...eventHits];
}
