/**
 * The price book: hourly history per asset, the latest answers with their
 * source, and the manual overrides that win over both. Rows resolve symbols
 * through the registry so no raw identifier reaches the screen.
 */
import type { Asset, Override, Price, PricePoint, QueryState } from "../lib/graphql.js";
import { assetBook, formatUnitPrice, symbolOf } from "../lib/assets.js";
import { ValueHistory } from "../lib/echart.js";

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
  const book = assetBook(assets.data ?? [], priced);
  const symbol = (id: string) => symbolOf(book.byId, id);
  const asset = picked ?? priced.at(0) ?? null;
  const series = (points.data ?? [])
    .filter((p) => !asset || p.asset === asset)
    .sort((a, b) => a.hour.localeCompare(b.hour));
  const history = series.map((p) => ({ at: p.hour, value: Number(p.price) || 0 }));

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
            {symbol(id)}
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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {symbol(asset)} / {currency}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {series.length === 0
                ? "no history yet"
                : `${series.length} hourly point${series.length === 1 ? "" : "s"} · ${new Date(
                    series[0].hour,
                  ).toLocaleString()} → ${new Date(series.at(-1)!.hour).toLocaleString()}`}
            </p>
          </div>
          <div className="mt-3">
            <ValueHistory
              points={history}
              formatValue={(v) => formatUnitPrice(String(v))}
              ariaLabel={`${symbol(asset)} price history`}
            />
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
                  <td className="px-3 py-2 font-medium">{symbol(p.asset)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUnitPrice(p.price)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.source.toLowerCase()}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(p.fetchedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {(latest.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No prices yet.
                  </td>
                </tr>
              )}
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
                  <td className="px-3 py-2 font-medium">{symbol(o.asset)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUnitPrice(o.price)}</td>
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
