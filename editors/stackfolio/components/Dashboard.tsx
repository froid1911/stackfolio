/**
 * The landing view: what the portfolio is worth, how it got there, what is
 * in it and what needs attention — the snapshot chart, the allocation, the
 * newest transactions and the open check issues.
 */
import { useDocumentById } from "@powerhousedao/reactor-browser";
import type {
  Asset,
  QueryState,
  Snapshot,
  Totals,
  Issue,
  EventRow,
  HoldingRow,
} from "../lib/graphql.js";
import { fmtAmount, fmtFiat } from "../lib/format.js";
import { Donut } from "../lib/charts.js";
import { ValueHistory } from "../lib/echart.js";
import { coverage, formatQuantity } from "../lib/assets.js";

const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

export function money(value: string | null | undefined, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency];
  const num = fmtFiat(value);
  if (value === null || value === undefined) return "—";
  return symbol ? `${symbol}${num}` : `${num} ${currency}`;
}

export function Dashboard({
  portfolioDocumentId,
  totals,
  snapshots,
  recent,
  issues,
  assets,
  holdings,
}: {
  portfolioDocumentId: string | undefined;
  totals: QueryState<Totals>;
  snapshots: QueryState<Snapshot[]>;
  recent: QueryState<{ rows: EventRow[]; total: number }>;
  issues: QueryState<Issue[]>;
  assets: QueryState<Asset[]>;
  holdings?: QueryState<{ holdings: HoldingRow[]; total: string } | null>;
}) {
  const [portfolio] = useDocumentById(portfolioDocumentId ?? "");
  const currency =
    (portfolio as { global?: { baseCurrency?: string } } | undefined)?.global?.baseCurrency ??
    "EUR";
  if (totals.error) return <p className="p-6 text-red-700">{totals.error}</p>;
  if (!totals.data) return <p className="p-6 text-muted-foreground">Loading the dashboard…</p>;

  const t = totals.data;
  const series = [...(snapshots.data ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = series.at(-1);
  const open = (issues.data ?? []).filter((i) => i.severity !== "RESOLVED").slice(0, 5);
  const cov = coverage(holdings?.data?.holdings ?? [], holdings?.data?.total ?? null);
  const history = series.map((s) => ({ at: s.timestamp, value: Number(s.totalValue) || 0 }));

  return (
    <div className="grid gap-4 p-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 sm:col-span-2">
          <p className="text-xs uppercase text-muted-foreground">Total value</p>
          <p className="mt-1 text-3xl font-semibold">
            {money(t.totalValue, currency)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.snapshotAt ? `as of ${new Date(t.snapshotAt).toLocaleString()}` : "no snapshot yet"}
          </p>
        </div>
        <Stat label="Transactions" value={String(t.events)} />
        <Stat label="Accounts" value={String(t.accounts)} />
        <Stat label="Validators" value={String(t.validators)} />
        <Stat
          label="Open issues"
          value={String(t.openIssues)}
          tone={t.openIssues > 0 ? "text-warning" : "text-success"}
        />
      </div>

      {cov.unpricedAssets > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-medium">Unpriced holdings</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {cov.unpricedAssets} of {cov.assets} tracked assets carry a quantity but
            no price, so they sit outside the total. Open Balances to review them;
            the {formatQuantity(String(cov.unpricedRows))} rows are kept, not dropped.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-medium">Needs attention</p>
          <ul className="mt-2 grid gap-1 text-xs">
            {open.map((i) => (
              <li key={`${i.documentId}-${i.seq}`} className="flex gap-2">
                <span
                  className={
                    i.severity === "BLOCKING" ? "text-red-700 font-medium" : "text-warning font-medium"
                  }
                >
                  {i.code}
                </span>
                <span className="text-muted-foreground">{i.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Total value over time</p>
          <p className="text-[10px] text-muted-foreground">
            {series.length === 0
              ? "no snapshots yet"
              : `${series.length} snapshot${series.length === 1 ? "" : "s"} · ${new Date(
                  series[0]!.timestamp,
                ).toLocaleString()} → ${new Date(series.at(-1)!.timestamp).toLocaleString()}`}
          </p>
        </div>
        <div className="mt-3">
          <ValueHistory
            points={history}
            formatValue={(v) => money(String(v), currency)}
            ariaLabel="Total portfolio value over time"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Allocation</p>
          <div className="mt-3">
            {latest && latest.assets.length > 0 ? (
              <Donut
                slices={topAssets(latest, (id) => symbolOf(assets.data, id))}
                center={money(latest.totalValue, currency)}
                sub="top holdings"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No holdings in a snapshot yet — they land with the first scan.
              </p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Latest transactions</p>
          {recent.data && recent.data.rows.length > 0 ? (
            <ul className="mt-2 grid gap-2 text-xs">
              {recent.data.rows.map((e) => (
                <li key={`${e.documentId}-${e.eventId}`} className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
                  <span className="grid">
                    <span className="font-medium">{e.counterpartyLabel ?? short(e.counterparty ?? e.address)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(e.timestamp).toLocaleString()} · {e.type.toLowerCase()}
                      {e.subtype !== "NONE" ? `/${e.subtype.toLowerCase()}` : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${e.type === "RECEIVE" ? "text-success" : e.type === "SPEND" ? "text-red-700" : ""}`}
                  >
                    {fmtAmount(e.amount, decimalsOf(assets.data, e.asset), 4)}{" "}
                    {symbolOf(assets.data, e.asset)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {recent.loading ? "Loading…" : "Nothing imported yet — the scan fills this in."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

export function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function decimalsOf(assets: Asset[] | null, identifier: string): number {
  return assets?.find((a) => a.identifier === identifier)?.decimals ?? 18;
}

function symbolOf(assets: Asset[] | null, identifier: string): string {
  return assets?.find((a) => a.identifier === identifier)?.symbol ?? identifier;
}

/** The snapshot's assets, biggest first, folded into top 6 + Other. */
export function topAssets(
  snapshot: Snapshot,
  labelOf: (identifier: string) => string,
): { label: string; value: number }[] {
  const rows = snapshot.assets
    .map((a) => ({ label: labelOf(a.asset), value: Number(a.value) || 0 }))
    .sort((x, y) => y.value - x.value);
  if (rows.length <= 7) return rows;
  const head = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((s, r) => s + r.value, 0);
  return [...head, { label: "Other", value: rest }];
}

