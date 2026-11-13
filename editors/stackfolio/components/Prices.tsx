/**
 * The price book: hourly history per asset, the latest answers with their
 * source, and the manual overrides that win over both. Rows resolve symbols
 * through the registry; an asset the registry does not know shows its short
 * contract id with its chain, never a bare CAIP string. The table is the
 * picker: search narrows it, a row click charts that asset.
 */
import { useState } from "react";
import type {
  Asset,
  Override,
  Price,
  PricePoint,
  QueryState,
} from "../lib/graphql.js";
import {
  assetBook,
  chainOf,
  formatUnitPrice,
  nameOf,
  symbolOf,
} from "../lib/assets.js";
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
  const [search, setSearch] = useState("");
  const priced = (latest.data ?? []).map((p) => p.asset);
  const book = assetBook(assets.data ?? [], priced);
  const symbol = (id: string) => symbolOf(book.byId, id);
  const asset = picked ?? priced.at(0) ?? null;
  const needle = search.trim().toLowerCase();
  const rows = (latest.data ?? []).filter(
    (p) =>
      !needle ||
      [symbol(p.asset), nameOf(book.byId, p.asset), p.asset].some((t) =>
        t.toLowerCase().includes(needle),
      ),
  );
  // Registry assets with no answer in the book, spoofs aside.
  const unpriced = book.rows.filter(
    (r) => !r.priced && r.tier !== "spam",
  ).length;
  const series = (points.data ?? [])
    .filter((p) => !asset || p.asset === asset)
    .sort((a, b) => a.hour.localeCompare(b.hour));
  const history = series.map((p) => ({
    at: p.hour,
    value: Number(p.price) || 0,
  }));

  return (
    <div className="grid gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbol, name or contract…"
          aria-label="Search prices"
          className="w-72 rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
        />
        <span className="text-xs text-muted-foreground">
          {priced.length} priced
          {unpriced > 0
            ? ` · ${unpriced} registered assets without a price (see Assets)`
            : ""}
        </span>
      </div>
      {priced.length === 0 && (
        <p className="text-sm text-muted-foreground">
          The price book has no answers yet — they arrive with the price fetch.
        </p>
      )}

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

      <div
        className={`grid gap-4 ${(overrides.data ?? []).length > 0 ? "lg:grid-cols-[2fr_1fr]" : ""}`}
      >
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Chain</th>
                <th className="px-3 py-2 text-right">Price ({currency})</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Fetched</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.asset}
                  onClick={() => setPicked(p.asset)}
                  aria-selected={asset === p.asset}
                  className={`cursor-pointer border-t border-border ${
                    asset === p.asset ? "bg-primary/10" : "hover:bg-muted/40"
                  }`}
                >
                  <td className="px-3 py-2">
                    <span className="font-medium">{symbol(p.asset)}</span>{" "}
                    <span className="text-muted-foreground">
                      {nameOf(book.byId, p.asset)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {chainOf(book.byId, p.asset)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUnitPrice(p.price)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {p.source.toLowerCase()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {new Date(p.fetchedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    {needle ? "No priced asset matches." : "No prices yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(overrides.data ?? []).length > 0 && (
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
                  <tr
                    key={`${o.documentId}/${o.asset}`}
                    className="border-t border-border"
                  >
                    <td className="px-3 py-2 font-medium">{symbol(o.asset)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUnitPrice(o.price)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(o.setAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
