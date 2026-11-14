/**
 * Wallet bundles: named groups of the portfolio's wallets. The active one
 * travels in the URL (`?bundle=<id>`) so every page, and a shared link,
 * narrows to the same wallets; no bundle means every wallet.
 */
import { useDocumentSafe, useSearchParams } from "@powerhousedao/reactor-browser";
import { useMemo } from "react";

export interface Bundle {
  id: string;
  name: string;
  addresses: string[];
}

export interface BundleScope {
  bundles: Bundle[];
  /** The bundle the URL names, or null for every wallet. */
  active: Bundle | null;
  /** Lower-cased wallets in scope, or null for every wallet. */
  wallets: ReadonlySet<string> | null;
}

/** The portfolio document's bundles, tolerating documents made before them. */
export function bundlesOf(doc: unknown): Bundle[] {
  const raw = (doc as { state?: { global?: { bundles?: unknown } } } | undefined)?.state
    ?.global?.bundles;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (b): b is Bundle =>
      typeof b === "object" &&
      b !== null &&
      typeof (b as Bundle).id === "string" &&
      typeof (b as Bundle).name === "string" &&
      Array.isArray((b as Bundle).addresses),
  );
}

/** A param naming a bundle that is gone reads as every wallet. */
export function scopeOf(bundles: Bundle[], param: string | undefined): BundleScope {
  const active = (param && bundles.find((b) => b.id === param)) || null;
  return {
    bundles,
    active,
    wallets: active ? new Set(active.addresses.map((a) => a.toLowerCase())) : null,
  };
}

export function inScope(wallets: ReadonlySet<string> | null, address: string | null | undefined): boolean {
  if (wallets === null) return true;
  return typeof address === "string" && wallets.has(address.toLowerCase());
}

/** Rows whose `key` wallet is in scope; every row without a bundle. */
export function scoped<T>(
  wallets: ReadonlySet<string> | null,
  rows: T[],
  key: (row: T) => string | null | undefined,
): T[] {
  return wallets === null ? rows : rows.filter((row) => inScope(wallets, key(row)));
}

export function useBundleScope(portfolioDocumentId: string | undefined): BundleScope {
  const { data } = useDocumentSafe(portfolioDocumentId);
  const { bundle } = useSearchParams();
  // Keyed by content: the document object changes on every operation.
  const key = JSON.stringify(bundlesOf(data));
  return useMemo(() => scopeOf(JSON.parse(key) as Bundle[], bundle), [key, bundle]);
}
