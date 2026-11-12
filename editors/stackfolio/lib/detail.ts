/**
 * `?detail=` plumbing. The URL carries the detail as a slug (Task 2's
 * one-way form: lowercase, separators kept); ids are never decoded from
 * it. Overlays fetch a candidate list (the rows of the page they sit on)
 * and match the candidate against the live ids with `slugMatches`, so
 * any reasonable URL spelling resolves and a stale link degrades to a
 * clear not-found affordance instead of a wrong row.
 */
import { useMemo } from "react";
import { useSearchParams } from "@powerhousedao/reactor-browser";
import { resolveNodeSlug, slugMatches } from "./slugs.js";
import type { Page } from "../nav.js";

/** The detail kinds each page's `?detail=` may carry. A detail on a page
 * that declares none is ignored (stale links land on the page alone).
 * The URL form is `<kind>:<slug>` — ids carry dots (event identifiers)
 * and slugs carry everything ids carry, so the delimiter lives between
 * the two fixed parts, never inside either. */
export const PAGE_DETAILS: Record<Page, readonly string[] | undefined> = {
  dashboard: undefined,
  balances: ["account", "asset"],
  history: ["event"],
  pnl: undefined,
  staking: undefined,
  "address-book": ["account"],
  assets: ["asset"],
  prices: undefined,
  defi: undefined,
};

export interface Detail {
  kind: string;
  /** The URL's slug (what to show while unresolved). */
  slug: string;
  /** The live id it names, or undefined until the rows arrive or when
   * the id is gone. Overlays MUST branch on this, never assume. */
  id: string | undefined;
}

/** Pure half of the hook: match a detail param against live ids. Exported
 * for tests; `candidateIds` should be stable (a memoized row mapping). */
export function resolveDetail(
  page: Page,
  detail: string | undefined,
  candidateIds: readonly string[],
): Detail | undefined {
  if (!detail) return undefined;
  const sep = detail.indexOf(":");
  const kind = sep < 0 ? "" : detail.slice(0, sep);
  const slug = sep < 0 ? detail : detail.slice(sep + 1);
  const kinds = PAGE_DETAILS[page];
  if (!kinds || !kind || !kinds.includes(kind)) return undefined;
  return {
    kind,
    slug,
    id: resolveNodeSlug(
      candidateIds.map((id) => ({ id })),
      slug,
    ),
  };
}

/** The page's current detail against the live ids it may name. */
export function useDetail(
  page: Page,
  candidateIds: readonly string[],
): Detail | undefined {
  const { detail } = useSearchParams();
  const idsKey = candidateIds.join("\u0000");
  const ids = useMemo(
    () => (idsKey ? idsKey.split("\u0000") : []),
    [idsKey],
  );
  return useMemo(
    () => resolveDetail(page, detail, ids),
    [page, detail, ids],
  );
}

export { slugMatches, resolveNodeSlug };
