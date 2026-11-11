/**
 * The price book: hourly history per asset, the latest answers with their
 * source, and the manual overrides that win over both.
 */
import type { Asset, Override, Price, PricePoint, QueryState } from "../lib/graphql.js";
import { fmtFiat } from "../lib/format.js";
import { Sparkline } from "../lib/charts.js";

export function Prices({
  assets,
  latest,
  points,
  overrides,
  picked,
  setPicked,
  currency,
}: {
  assets: QueryState<Asset[]>;
  latest: QueryState<Price[]>;
  points: QueryState<PricePoint[]>;
  overrides: QueryState<Override[]>;
  picked: string | null;
  setPicked: (v: string | null) => void;
  currency: string;
}) {
  const priced = (latest.data ?? []).map((p) => p.asset);
  const symbols = new Map((assets.data ?? []).map((a) => [a.identifier, a.symbol]));
  const asset = picked ?? priced.at(0) ?? null;
  const series = (points.data ?? [])
    .filter((p) => !picked || p.asset === picked)
    .sort((a, b) => a.hour.localeCompare(b.hour));

  return (
    <div className="grid gap-4 p-6">
      <div className="flex flex-wrap gap-1">
        {priced.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setPicked(id)}
            className={`rounded-lg border border-border px-2.5 py-1 text-xs ${
              asset === id ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {symbols.get(id) ?? id}
          </button>
        ))}
        {priced.length === 0 && (
          <p className="text-sm text-muted-foreground">
            The price book has no answers yet — they arrive with the price fetch.
          </p>
        )}
      </div>

      {asset && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">
            {symbols.get(asset) ?? asset} / {currency}
          </p>
          <div className="mt-3">
            <Sparkline points={series.map((p) => Number(p.price) || 0)} strokeClass="text-sky-500" />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{series[0] ? new Date(series[0].hour).toLocaleString() : ""}</span>
              <span>
                {series[series.length - 1]
                  ? new Date(series[series.length - 1].hour).toLocaleString()
                  : ""}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Fetched</th>
              </tr>
            </thead>
            <tbody>
              {(latest.data ?? []).map((p) => (
                <tr key={p.asset} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{symbols.get(p.asset) ?? p.asset}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtFiat(p.price, 6)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.source.toLowerCase()}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(p.fetchedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Override</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Set</th>
              </tr>
            </thead>
            <tbody>
              {(overrides.data ?? []).map((o) => (
                <tr key={`${o.documentId}/${o.asset}`} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{symbols.get(o.asset) ?? o.asset}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtFiat(o.price, 6)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(o.setAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {(overrides.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                    No manual overrides.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
