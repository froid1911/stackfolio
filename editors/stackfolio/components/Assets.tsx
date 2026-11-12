/**
 * The asset book: what the registry knows, what the latest snapshot holds
 * and what the price book says each is worth.
 */
import type { Asset, Price, QueryState, Snapshot } from "../lib/graphql.js";
import { fmtFiat } from "../lib/format.js";

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
  if (assets.error) return <p className="p-6 text-red-700">{assets.error}</p>;
  if (!assets.data) return <p className="p-6 text-muted-foreground">Loading assets…</p>;
  const priceOf = new Map((prices.data ?? []).map((p) => [p.asset, p]));
  const series = [...(snapshots.data ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = series.at(-1);
  const held = new Map((latest ? latest.assets : []).map((a) => [a.asset, a]));

  return (
    <div className="p-6">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Asset</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2 text-right">Held</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {assets.data.map((a) => {
              const h = held.get(a.identifier);
              const p = priceOf.get(a.identifier);
              return (
                <tr
                  key={a.identifier}
                  className="cursor-pointer border-t border-border hover:bg-muted/30"
                  onClick={() => onOpenAsset(a.identifier)}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium">{a.symbol}</span>{" "}
                    <span className="text-muted-foreground">{a.name}</span>
                    {a.custom && (
                      <span className="ml-1 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
                        custom
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {a.kind.toLowerCase()} · chain {a.chainId}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {h ? fmtFiat(h.amount, 6) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p ? fmtFiat(p.price, 6) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {h ? fmtFiat(h.value) : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p ? `${p.source.toLowerCase()} · ${new Date(p.fetchedAt).toLocaleTimeString()}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Held and value read the newest snapshot (all locations together) in {currency}.
      </p>
    </div>
  );
}
