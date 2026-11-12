/**
 * The ledger: every imported event, newest first, filtered by account,
 * asset and kind. The row write path stays in the wallet document; the
 * index only reads.
 */
import { useState } from "react";
import type { AccountRow, Asset, EventsFilter, EventRow, QueryState } from "../lib/graphql.js";
import { fmtAmount } from "../lib/format.js";
import { short } from "./Dashboard.js";

const TYPE_TABS: { id: string; label: string; types?: string[] }[] = [
  { id: "all", label: "All" },
  { id: "movement", label: "Movements", types: ["SPEND", "RECEIVE", "TRANSFER"] },
  { id: "trade", label: "Trades", types: ["TRADE"] },
  { id: "staking", label: "Staking", types: ["STAKING"] },
  { id: "other", label: "Other", types: ["MIGRATE", "INFORMATIONAL"] },
];

const PAGE = 50;

export function Transactions({
  accounts,
  assets,
  filter,
  setFilter,
  page,
}: {
  accounts: QueryState<AccountRow[]>;
  assets: QueryState<Asset[]>;
  filter: EventsFilter;
  setFilter: (f: EventsFilter) => void;
  page: QueryState<{ rows: EventRow[]; total: number }>;
}) {
  const [search, setSearch] = useState("");
  const [showIgnored, setShowIgnored] = useState(false);
  const decimals = new Map((assets.data ?? []).map((a) => [a.identifier, a]));
  const rows = page.data?.rows ?? [];
  const total = page.data?.total ?? 0;
  const offset = filter.offset ?? 0;

  const typeTab = TYPE_TABS.find((t) => sameTypes(t.types, filter.types))?.id ?? "all";

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      {filter.ids && filter.ids.length > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs">
          <span>
            Pinned to {filter.ids.length} linked ledger event
            {filter.ids.length === 1 ? "" : "s"} from the P&L view.
          </span>
          <button
            type="button"
            className="text-accent underline-offset-2 hover:underline"
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
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Counterparty</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const asset = decimals.get(e.asset);
              const signed = e.type === "RECEIVE" ? "+" : e.type === "SPEND" ? "−" : "";
              return (
                <tr key={`${e.documentId}/${e.eventId}`} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px]">
                      {e.type.toLowerCase()}
                      {e.subtype !== "NONE" ? ` · ${e.subtype.toLowerCase().replace("_", " ")}` : ""}
                    </span>
                    {e.source === "MANUAL" && (
                      <span className="ml-1 text-[10px] text-muted-foreground">manual</span>
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
                  <td className="px-3 py-2">
                    {e.counterpartyLabel ?? (e.counterparty ? short(e.counterparty) : "—")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {e.label ?? short(e.address)}
                  </td>
                  <td className="max-w-60 truncate px-3 py-2 text-muted-foreground" title={e.notes ?? ""}>
                    {e.notes ?? ""}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !page.loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
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
    </div>
  );
}

function sameTypes(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
