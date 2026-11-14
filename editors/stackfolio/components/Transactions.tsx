/**
 * The History page: the events table, a "Needs a type" sub-tab (the review
 * queue, rendered by the caller), an "Issues" sub-tab over the
 * reconciler's open check issues, CSV export of the filtered set, and
 * rows that open the event detail (the shell owns routing; this
 * component only reports intent through callbacks).
 */
import { useState, type ReactNode } from "react";
import type {
  AccountRow,
  Asset,
  EventsFilter,
  EventRow,
  Issue,
  QueryState,
} from "../lib/graphql.js";
import { fmtAmount } from "../lib/format.js";
import { formatUnitPrice } from "../lib/assets.js";
import { direction } from "../lib/review.js";
import { toCsv } from "../lib/csv.js";
import { short } from "./Dashboard.js";
import { CATEGORY_CHOICES, CATEGORY_LABEL, SOURCE_LABEL } from "../lib/categories.js";

const TYPE_TABS: { id: string; label: string; types?: string[] }[] = [
  { id: "all", label: "All" },
  { id: "movement", label: "Movements", types: ["SPEND", "RECEIVE", "TRANSFER"] },
  { id: "trade", label: "Trades", types: ["TRADE"] },
  { id: "staking", label: "Staking", types: ["STAKING"] },
  { id: "other", label: "Other", types: ["MIGRATE", "INFORMATIONAL"] },
];

const PAGE = 50;

const EVENT_HEADERS = [
  "timestamp",
  "type",
  "subtype",
  "category",
  "asset",
  "amount",
  "counterparty",
  "account",
  "notes",
];

/** The filtered page as CSV rows - the guard lives in lib/csv. */
export function eventsCsv(rows: EventRow[], symbolOf: (asset: string) => string): string {
  return toCsv(
    EVENT_HEADERS,
    rows.map((e) => [
      e.timestamp,
      e.type,
      e.subtype,
      e.category ?? "",
      symbolOf(e.asset),
      e.amount,
      e.counterpartyLabel ?? e.counterparty,
      e.label ?? e.address,
      e.notes,
    ]),
  );
}

export type HistorySub = "events" | "queue" | "issues";

export function Transactions({
  accounts,
  assets,
  filter,
  setFilter,
  page,
  sub = "events",
  issues,
  onSub,
  onOpenEvent,
  onOpenAccount,
  needsPriceCount,
  queueCount,
  queueView,
}: {
  accounts: QueryState<AccountRow[]>;
  assets: QueryState<Asset[]>;
  filter: EventsFilter;
  setFilter: (f: EventsFilter) => void;
  page: QueryState<{ rows: EventRow[]; total: number }>;
  sub?: HistorySub;
  issues?: QueryState<Issue[]>;
  onSub?: (sub: HistorySub) => void;
  onOpenEvent?: (eventId: string) => void;
  onOpenAccount?: (address: string) => void;
  /** Events the books cannot value yet, across the drive. */
  needsPriceCount?: number;
  /** Transactions waiting for a tax category. */
  queueCount?: number;
  /** The "Needs a type" sub-tab's content. */
  queueView?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);
  const decimals = new Map((assets.data ?? []).map((a) => [a.identifier, a]));
  const rows = page.data?.rows ?? [];
  const total = page.data?.total ?? 0;
  const offset = filter.offset ?? 0;

  const typeTab = TYPE_TABS.find((t) => sameTypes(t.types, filter.types))?.id ?? "all";
  const symbolOf = (asset: string) => decimals.get(asset)?.symbol ?? asset;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border text-xs">
          <button
            type="button"
            data-sub="events"
            onClick={() => onSub?.("events")}
            className={`px-3 py-1.5 ${sub === "events" ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"}`}
          >
            Events
          </button>
          <button
            type="button"
            data-sub="queue"
            onClick={() => onSub?.("queue")}
            className={`px-3 py-1.5 ${sub === "queue" ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"}`}
          >
            Needs a type
            {queueCount ? ` (${queueCount})` : ""}
          </button>
          <button
            type="button"
            data-sub="issues"
            onClick={() => onSub?.("issues")}
            className={`px-3 py-1.5 ${sub === "issues" ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"}`}
          >
            Issues
            {issues?.data && issues.data.length > 0 ? ` (${issues.data.length})` : ""}
          </button>
        </div>
        {sub !== "events" ? null : (
          <>
            <div className="flex overflow-hidden rounded-lg border border-border text-xs">
              {TYPE_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter({ ...filter, types: t.types, offset: 0 })}
                  className={`px-3 py-1.5 ${typeTab === t.id ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              value={filter.address ?? ""}
              onChange={(e) => setFilter({ ...filter, address: e.target.value || undefined, offset: 0 })}
            >
              <option value="">All accounts</option>
              {(accounts.data ?? []).map((a) => (
                <option key={`${a.documentId}`} value={a.address}>
                  {a.label || short(a.address)}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              value={filter.asset ?? ""}
              onChange={(e) => setFilter({ ...filter, asset: e.target.value || undefined, offset: 0 })}
            >
              <option value="">All assets</option>
              {(assets.data ?? []).map((a) => (
                <option key={a.identifier} value={a.identifier}>
                  {a.symbol}
                </option>
              ))}
            </select>
            <select
              aria-label="Tax category"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              value={filter.categories?.[0] ?? ""}
              onChange={(e) =>
                setFilter({ ...filter, categories: e.target.value ? [e.target.value] : undefined, offset: 0 })
              }
            >
              <option value="">All categories</option>
              <option value="UNCLASSIFIED">{CATEGORY_LABEL.UNCLASSIFIED}</option>
              <option value="SPAM">{CATEGORY_LABEL.SPAM}</option>
              {CATEGORY_CHOICES.map(({ group, options }) => (
                <optgroup key={group} label={group}>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {CATEGORY_LABEL[o]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              className="w-44 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
              placeholder="Search notes, counterparties…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFilter({ ...filter, query: e.target.value || undefined, offset: 0 });
              }}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showIgnored}
                onChange={(e) => {
                  setShowIgnored(e.target.checked);
                  setFilter({ ...filter, ignored: e.target.checked ? undefined : false, offset: 0 });
                }}
              />
              show ignored
            </label>
            <label className="flex items-center gap-1 text-xs text-warning">
              <input
                type="checkbox"
                checked={Boolean(filter.needsPrice)}
                onChange={(e) =>
                  setFilter({ ...filter, needsPrice: e.target.checked || undefined, offset: 0 })
                }
              />
              needs a price{needsPriceCount !== undefined ? ` (${needsPriceCount})` : ""}
            </label>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob(["﻿" + eventsCsv(rows, symbolOf)], {
                  type: "text/csv;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `stackfolio-events-${new Date().toISOString().slice(0, 10)}.csv`;
                anchor.style.display = "none";
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                URL.revokeObjectURL(url);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
            >
              Export CSV
            </button>
          </>
        )}
      </div>

      {sub === "queue" ? (
        queueView
      ) : sub === "issues" ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Check</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Since</th>
              </tr>
            </thead>
            <tbody>
              {(issues?.data ?? []).map((issue) => (
                <tr key={`${issue.documentId}/${issue.seq}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        issue.severity === "ERROR"
                          ? "border-error text-error"
                          : issue.severity === "WARNING"
                            ? "border-warning text-warning"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {issue.severity.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2">{issue.code}</td>
                  <td className="px-3 py-2">{issue.message}</td>
                  <td className="px-3 py-2">
                    {issue.accountId ? (
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => {
                          setFilter({
                            ...filter,
                            ids: undefined,
                            address: issue.accountId as string,
                            offset: 0,
                          });
                          onSub?.("events");
                        }}
                      >
                        {issue.accountId.slice(0, 10)}…
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(issue.at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {(issues?.data ?? []).length === 0 && !issues?.loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    No open issues. The reconciler is happy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {filter.ids && filter.ids.length > 0 && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs">
              <span>
                Pinned to {filter.ids.length} linked ledger event
                {filter.ids.length === 1 ? "" : "s"} from the P&L view.
              </span>
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={() => setFilter({ ...filter, ids: undefined, offset: 0 })}
              >
                Show all
              </button>
            </div>
          )}

          {page.error && <p className="mt-3 text-sm text-red-700">{page.error}</p>}

          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2">Counterparty</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const asset = decimals.get(e.asset);
                  const dir = direction(e.type);
                  const signed = dir === "in" ? "+" : dir === "out" ? "−" : "";
                  return (
                    <tr
                      key={`${e.documentId}/${e.eventId}/${e.sequenceIndex}`}
                      className="cursor-pointer border-t border-border hover:bg-muted/30"
                      onClick={() => onOpenEvent?.(e.eventId)}
                    >
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {new Date(e.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`mr-1 inline-block w-9 rounded px-1 py-0.5 text-center text-[10px] font-semibold ${
                            dir === "in"
                              ? "bg-success/10 text-success"
                              : dir === "out"
                                ? "bg-red-500/10 text-red-700"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {dir === "in" ? "IN" : dir === "out" ? "OUT" : "⇄"}
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">
                          {e.type.toLowerCase()}
                          {e.subtype !== "NONE" ? ` · ${e.subtype.toLowerCase().replace("_", " ")}` : ""}
                        </span>
                        {e.source === "MANUAL" && (
                          <span className="ml-1 text-[10px] text-muted-foreground">manual</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {e.category && (
                          <span
                            data-category={e.category}
                            title={SOURCE_LABEL[e.categorySource ?? ""] ?? undefined}
                            className={`rounded-full border px-2 py-0.5 text-[10px] ${
                              e.category === "UNCLASSIFIED"
                                ? "border-warning/50 text-warning"
                                : e.category === "SPAM"
                                  ? "border-border text-muted-foreground line-through"
                                  : "border-border"
                            }`}
                          >
                            {CATEGORY_LABEL[e.category] ?? e.category}
                            {e.categorySource === "override" || e.categorySource === "rule" ? " •" : ""}
                          </span>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                          e.type === "RECEIVE" ? "text-success" : e.type === "SPEND" || e.type === "TRADE" ? "" : ""
                        }`}
                      >
                        {signed}
                        {fmtAmount(e.amount, asset?.decimals ?? 18, 6)}{" "}
                        <span className="text-muted-foreground">{asset?.symbol ?? e.asset}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {e.price !== null ? (
                          <>
                            {formatUnitPrice(e.price)}
                            {e.priceSource === "MANUAL" && (
                              <span className="ml-1 rounded-full border border-primary/40 px-1.5 text-[10px] text-primary">
                                manual
                              </span>
                            )}
                          </>
                        ) : e.priceGap === "value" ? (
                          <span className="rounded-full border border-warning/50 px-1.5 text-[10px] text-warning">
                            needs a price
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {e.priceGap === "basis" && (
                          <span
                            className="ml-1 rounded-full border border-warning/50 px-1.5 text-[10px] text-warning"
                            title="No cost basis: an earlier acquisition of this asset has no price"
                          >
                            no cost basis
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {e.counterpartyLabel ?? (e.counterparty ? short(e.counterparty) : "—")}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <button
                          type="button"
                          className="hover:underline"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            onOpenAccount?.(e.address);
                          }}
                        >
                          {e.label ?? short(e.address)}
                        </button>
                      </td>
                      <td className="max-w-60 truncate px-3 py-2 text-muted-foreground" title={e.notes ?? ""}>
                        {e.notes ?? ""}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !page.loading && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      No events match these filters yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {total > 0 ? `${offset + 1}–${Math.min(offset + PAGE, total)} of ${total}` : ""}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setFilter({ ...filter, offset: Math.max(0, offset - PAGE) })}
                className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
              >
                Newer
              </button>
              <button
                type="button"
                disabled={offset + PAGE >= total}
                onClick={() => setFilter({ ...filter, offset: offset + PAGE })}
                className="rounded-lg border border-border px-3 py-1 disabled:opacity-40"
              >
                Older
              </button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function sameTypes(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
