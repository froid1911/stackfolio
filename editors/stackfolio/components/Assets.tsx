/**
 * The asset book: what the registry knows, what the newest snapshot holds and
 * what the price book says each is worth — with the trust layer applied.
 *
 * Filters keep the four populations separate: valued assets, unpriced assets
 * (quantity but no price), suspected spam and everything else. Spam never
 * counts toward totals and is hidden unless asked for.
 */
import { useState } from "react";
import type { Asset, Price, QueryState, Snapshot } from "../lib/graphql.js";
import { fmtFiat } from "../lib/format.js";
import {
  ambiguousTicker,
  assetBook,
  chainLabel,
  formatQuantity,
  formatUnitPrice,
  type AssetTier,
} from "../lib/assets.js";

type Filter = "all" | "valued" | "unpriced" | "spam";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "valued", label: "Valued" },
  { id: "unpriced", label: "Unpriced" },
  { id: "spam", label: "Suspected spam" },
];

function inFilter(tier: AssetTier, priced: boolean, filter: Filter): boolean {
  if (filter === "spam") return tier === "spam";
  if (tier === "spam") return false;
  if (filter === "valued") return priced;
  if (filter === "unpriced") return !priced;
  return true;
}

export function Assets({
  assets,
  prices,
  snapshots,
  currency,
  onOpenAsset,
}: {
  assets: QueryState<Asset[]>;
  prices: QueryState<Price[]>;
  snapshots: QueryState<Snapshot[]>;
  currency: string;
  onOpenAsset: (identifier: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  if (assets.error) return <p className="p-6 text-red-700">{assets.error}</p>;
  if (!assets.data) return <p className="p-6 text-muted-foreground">Loading assets…</p>;

  const priceOf = new Map((prices.data ?? []).map((p) => [p.asset, p]));
  const book = assetBook(assets.data, priceOf.keys());
  const series = [...(snapshots.data ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = series.at(-1);
  const held = new Map((latest ? latest.assets : []).map((a) => [a.asset, a]));

  const counts = { all: 0, valued: 0, unpriced: 0, spam: 0 };
  for (const row of book.rows) {
    if (row.tier === "spam") {
      counts.spam += 1;
      continue;
    }
    counts.all += 1;
    if (row.priced) counts.valued += 1;
    else counts.unpriced += 1;
  }

  const rows = book.rows.filter((row) => inFilter(row.tier, row.priced, filter));

  return (
    <div className="grid gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 ${filter === f.id ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"}`}
            >
              {f.label}
              <span className="ml-1 text-[10px] opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <p className="ml-auto text-[10px] text-muted-foreground">
          {rows.length} of {book.rows.length} registry assets
          {counts.spam > 0 && filter !== "spam" ? " · spam hidden" : ""}
        </p>
      </div>

      {filter === "unpriced" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-700">
          {counts.unpriced} assets carry a quantity but no price. Their holdings sit
          outside the portfolio total until a price is fetched or overridden in Prices.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2">Chain</th>
              <th className="px-3 py-2 text-right">Held</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ asset, tier, priced, collisions }) => {
              const h = held.get(asset.identifier);
              const p = priceOf.get(asset.identifier);
              return (
                <tr
                  key={asset.identifier}
                  className="cursor-pointer border-t border-border hover:bg-muted/30"
                  onClick={() => onOpenAsset(asset.identifier)}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium">{asset.symbol}</span>{" "}
                    <span className="text-muted-foreground">{asset.name}</span>
                    {tier === "verified" && (
                      <span className="ml-1 rounded-full border border-emerald-500/40 px-1.5 text-[10px] text-emerald-700">
                        verified
                      </span>
                    )}
                    {tier === "spam" && (
                      <span className="ml-1 rounded-full border border-red-500/40 px-1.5 text-[10px] text-red-700">
                        suspected spam
                      </span>
                    )}
                    {asset.custom && (
                      <span className="ml-1 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
                        custom
                      </span>
                    )}
                    {ambiguousTicker({ asset, tier, priced, collisions }) && (
                      <span className="ml-1 rounded-full border border-amber-500/40 px-1.5 text-[10px] text-amber-700">
                        shared ticker
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{chainLabel(asset.chainId)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {h ? formatQuantity(h.amount) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p ? formatUnitPrice(p.price) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p && h ? fmtFiat(h.value) : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p ? `${p.source.toLowerCase()} · ${new Date(p.fetchedAt).toLocaleTimeString()}` : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No assets match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Held and value read the newest snapshot (all locations together) in {currency}.
        Values without a price stay "—" rather than zero.
      </p>
    </div>
  );
}
