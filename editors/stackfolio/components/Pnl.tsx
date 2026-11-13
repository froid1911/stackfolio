/**
 * The P&L view: monthly accounting buckets over a period, the realized
 * disposals with their consumed-lot lineage, the open cost-basis lots and
 * the two honesty banners - events the books could not price, and the
 * Hyperliquid exposure the accounting fold deliberately does not touch.
 *
 * All amounts from the accounting index are 1e8-scaled integers crossed
 * as strings; `scaled` renders them. Quantities are raw units scaled by
 * the registry decimals.
 */
import { useState, type ReactNode } from "react";
import type {
  AccountRow,
  Asset,
  PnlBucket,
  QueryState,
  RealizedEvent,
} from "../lib/graphql.js";
import { useHyperliquidAccounts, useIncomeByMonth, useOpenLots, usePnlReport, useRealizedEvents, useUnpricedSummary } from "../lib/graphql.js";
import { fmtAmount, fmtFiat, unscale } from "../lib/format.js";
import { money, short } from "./Dashboard.js";

const PERIODS: { id: string; label: string; months?: number; ytd?: boolean }[] = [
  { id: "1m", label: "1M", months: 1 },
  { id: "3m", label: "3M", months: 3 },
  { id: "6m", label: "6M", months: 6 },
  { id: "12m", label: "12M", months: 12 },
  { id: "ytd", label: "YTD", ytd: true },
  { id: "all", label: "All" },
];

/** [from, to) for a preset; "all" spans more than the chain has lived. */
function windowOf(period: (typeof PERIODS)[number], now: string): {
  from: string;
  to: string;
} {
  if (period.ytd) {
    return { from: `${now.slice(0, 4)}-01-01T00:00:00.000Z`, to: now };
  }
  if (period.months) {
    const start = new Date(now);
    start.setUTCMonth(start.getUTCMonth() - period.months);
    return { from: start.toISOString(), to: now };
  }
  return { from: "1970-01-01T00:00:00.000Z", to: "2999-12-31T23:59:59.000Z" };
}

/** A 1e8-scaled integer string as a plain decimal, for `money`. */
const fiat = (value: string): string | null => unscale(value, 8);
/** A 1e8-scaled integer string as fiat, rounded down like every value. */
const scaled = (value: string): string => fmtFiat(fiat(value));

export function Pnl({
  driveId,
  currency,
  assets,
  accounts,
  onOpenEvents,
}: {
  driveId: string;
  currency: string;
  assets: QueryState<Asset[]>;
  accounts: QueryState<AccountRow[]>;
  onOpenEvents: (eventIds: string[]) => void;
}) {
  const [periodId, setPeriodId] = useState("12m");
  const [wallet, setWallet] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showLots, setShowLots] = useState(false);
  // One clock per mount: the query window must not move when a response
  // re-renders the component, or every answer would trigger the next
  // request with fresh `to` variables - an endless refetch loop.
  const [now] = useState(() => new Date().toISOString());
  const period = PERIODS.find((p) => p.id === periodId) ?? PERIODS[4];
  const window = windowOf(period, now);

  const report = usePnlReport(driveId, { ...window, wallet });
  const realized = useRealizedEvents(driveId, { ...window, wallet });
  const income = useIncomeByMonth(driveId, wallet);
  const unpriced = useUnpricedSummary(driveId, wallet);
  const lots = useOpenLots(driveId, wallet);
  const hyperliquid = useHyperliquidAccounts(driveId);

  const symbol = new Map((assets.data ?? []).map((a) => [a.identifier, a]));
  const labelFor = (address: string): string => {
    const account = (accounts.data ?? []).find((a) => a.address === address);
    return account?.label || short(address);
  };
  const decimalsOf = (asset: string): number =>
    symbol.get(asset)?.decimals ?? (asset.startsWith("bip122:") ? 8 : 18);

  const months = mergeMonths(report.data ?? []);
  const totals = months.reduce(
    (t, m) => ({
      income: t.income + BigInt(m.income),
      expense: t.expense + BigInt(m.expense),
      realized: t.realized + BigInt(m.realizedPnl),
      unpricedIn: t.unpricedIn + m.unpricedIn,
      unpricedOut: t.unpricedOut + m.unpricedOut,
    }),
    {
      income: 0n,
      expense: 0n,
      realized: 0n,
      unpricedIn: 0,
      unpricedOut: 0,
    },
  );

  const unpricedRows = (unpriced.data ?? []).filter(
    (u) => u.month >= window.from.slice(0, 7) && u.month <= window.to.slice(0, 7),
  );
  const unpricedIn = unpricedRows.reduce((n, u) => n + u.inCount, 0);
  const unpricedOut = unpricedRows.reduce((n, u) => n + u.outCount, 0);
  const oldestUnpriced = [...unpricedRows].sort((a, b) =>
    a.month.localeCompare(b.month),
  )[0];

  const hl = hyperliquid.data ?? [];
  const error = report.error ?? realized.error;
  if (error) return <p className="p-6 text-red-700">{error}</p>;
  if (!report.data) return <p className="p-6 text-muted-foreground">Loading the books…</p>;

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-border text-xs">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriodId(p.id)}
            className={`px-3 py-1.5 ${periodId === p.id ? "bg-primary font-medium text-primary-foreground" : "hover:bg-muted"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <select
        className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        value={wallet ?? ""}
        onChange={(e) => setWallet(e.target.value || undefined)}
      >
        <option value="">All wallets</option>
        {(accounts.data ?? []).map((a) => (
          <option key={a.documentId} value={a.address}>
            {a.label || short(a.address)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setShowLots((v) => !v)}
        className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
      >
        {showLots ? "Hide open lots" : `Open lots (${(lots.data ?? []).length})`}
      </button>
    </div>
  );

  // Coverage first: an empty or all-zero window is a data problem, not a
  // zero result — say why instead of drawing a table of zeros.
  const settled = totals.income !== 0n || totals.expense !== 0n || totals.realized !== 0n;
  if (!settled) {
    const missingBasis = unpricedIn > 0;
    const missingValue = unpricedOut > 0;
    return (
      <div className="grid gap-4 p-6">
        {controls}
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium">No P&L in this window</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {missingBasis
              ? `${unpricedIn} disposal${unpricedIn === 1 ? "" : "s"} without a cost basis. `
              : ""}
            {missingValue
              ? `${unpricedOut} disposal${unpricedOut === 1 ? "" : "s"} without a value. `
              : ""}
            {missingBasis || missingValue
              ? "The events are booked; the books cannot price them yet."
              : "No disposals, income or expenses are settled in this window."}
          </p>
          {(missingBasis || missingValue) && (
            <>
              <p className="mt-2 text-xs font-medium text-muted-foreground">How to fix</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                {missingBasis && (
                  <li>Price the acquisitions so the disposal cost is known.</li>
                )}
                {missingValue && (
                  <li>Price the disposals so the proceeds are known.</li>
                )}
                <li>Link transfers so cost basis follows the asset across wallets.</li>
              </ul>
              {oldestUnpriced && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Oldest unpriced activity: {oldestUnpriced.month}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-6">
      {controls}

      {(unpricedIn > 0 || unpricedOut > 0) && (
        <Banner tone="warning">
          {unpricedIn} disposal{unpricedIn === 1 ? "" : "s"} without cost basis
          and {unpricedOut} without a value are counted, not guessed, in this
          window
          {oldestUnpriced ? ` — oldest in ${oldestUnpriced.month}` : ""}. Price
          them in the wallet ledger to settle the books.
        </Banner>
      )}
      {hl.length > 0 && (
        <Banner tone="muted">
          Out of accounting scope: {hl.map((h) => h.label || short(h.address)).join(", ")}{" "}
          — Hyperliquid balances and positions show on the dashboard but carry
          no cost basis here.
        </Banner>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={`Income ${period.label}`} value={money(fiat(totals.income.toString()), currency)} />
        <Stat
          label={`Realized P&L ${period.label}`}
          value={money(fiat(totals.realized.toString()), currency)}
          tone={totals.realized >= 0n ? "good" : "bad"}
        />
        <Stat label={`Expenses ${period.label}`} value={money(fiat(totals.expense.toString()), currency)} />
      </div>

      <section className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Month</th>
              <th className="px-4 py-2 text-right">Income</th>
              <th className="px-4 py-2 text-right">Expenses</th>
              <th className="px-4 py-2 text-right">Realized P&L</th>
              <th className="px-4 py-2 text-right">Unpriced</th>
            </tr>
          </thead>
          <tbody>
            {months.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Nothing to report in this window.
                </td>
              </tr>
            )}
            {months.map((m) => (
              <tr key={m.month} className="border-t border-border">
                <td className="px-4 py-2 font-medium">{m.month}</td>
                <td className="px-4 py-2 text-right font-mono">{scaled(m.income)}</td>
                <td className="px-4 py-2 text-right font-mono">{scaled(m.expense)}</td>
                <td
                  className={`px-4 py-2 text-right font-mono ${m.realizedPnl.startsWith("-") ? "text-red-600" : "text-emerald-700"}`}
                >
                  {scaled(m.realizedPnl)}
                </td>
                <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                  {m.unpricedIn + m.unpricedOut > 0
                    ? `${m.unpricedIn} in · ${m.unpricedOut} out`
                    : "—"}
                </td>
              </tr>
            ))}
            {months.length > 0 && (
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right font-mono">{scaled(totals.income.toString())}</td>
                <td className="px-4 py-2 text-right font-mono">{scaled(totals.expense.toString())}</td>
                <td className="px-4 py-2 text-right font-mono">{scaled(totals.realized.toString())}</td>
                <td className="px-4 py-2 text-right text-xs">
                  {totals.unpricedIn + totals.unpricedOut > 0
                    ? `${totals.unpricedIn} in · ${totals.unpricedOut} out`
                    : "—"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {showLots && (
        <section className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs uppercase text-muted-foreground">
            Open lots — first in, first out
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Wallet</th>
                <th className="px-4 py-2">Asset</th>
                <th className="px-4 py-2 text-right">Quantity</th>
                <th className="px-4 py-2 text-right">Unit cost</th>
                <th className="px-4 py-2 text-right">From event</th>
              </tr>
            </thead>
            <tbody>
              {(lots.data ?? []).map((lot) => (
                <tr key={`${lot.wallet}|${lot.asset}|${lot.sourceEventId}`} className="border-t border-border">
                  <td className="px-4 py-2">{labelFor(lot.wallet)}</td>
                  <td className="px-4 py-2">{symbol.get(lot.asset)?.symbol ?? lot.asset}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {fmtAmount(lot.quantity, decimalsOf(lot.asset), 6)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">
                    {money(lot.unitCost, currency)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <EventLink onClick={() => onOpenEvents([lot.sourceEventId])}>
                      source
                    </EventLink>
                  </td>
                </tr>
              ))}
              {(lots.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No open lots: everything held is fully costed in or out.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border">
        <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs uppercase text-muted-foreground">
          Realized disposals
        </p>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Wallet</th>
              <th className="px-4 py-2">Asset</th>
              <th className="px-4 py-2 text-right">Quantity</th>
              <th className="px-4 py-2 text-right">Proceeds</th>
              <th className="px-4 py-2 text-right">Cost</th>
              <th className="px-4 py-2 text-right">P&L</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(realized.data ?? []).map((row) => (
              <RealizedRow
                key={row.id}
                row={row}
                expanded={expanded === row.id}
                onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                labelFor={labelFor}
                symbolOf={(asset) => symbol.get(asset)?.symbol ?? asset}
                decimalsOf={decimalsOf}
                onOpenEvents={onOpenEvents}
              />
            ))}
            {(realized.data ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                  No disposals settled in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {(income.data ?? []).length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs uppercase text-muted-foreground">
            Income by bucket
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Month</th>
                <th className="px-4 py-2">Wallet</th>
                <th className="px-4 py-2">Bucket</th>
                <th className="px-4 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {(income.data ?? [])
                .filter(
                  (i) =>
                    i.month >= window.from.slice(0, 7) &&
                    i.month <= window.to.slice(0, 7),
                )
                .map((i) => (
                  <tr key={`${i.wallet}|${i.bucket}|${i.month}`} className="border-t border-border">
                    <td className="px-4 py-2">{i.month}</td>
                    <td className="px-4 py-2">{labelFor(i.wallet)}</td>
                    <td className="px-4 py-2">
                      {i.bucket.toLowerCase().replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {money(fiat(i.amount), currency)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/** Pnl_month rows are per wallet; the summary page shows one row per month. */
function mergeMonths(rows: PnlBucket[]): PnlBucket[] {
  const byMonth = new Map<string, PnlBucket>();
  for (const row of rows) {
    const month = byMonth.get(row.month);
    if (!month) {
      byMonth.set(row.month, { ...row });
      continue;
    }
    byMonth.set(row.month, {
      ...month,
      income: (BigInt(month.income) + BigInt(row.income)).toString(),
      expense: (BigInt(month.expense) + BigInt(row.expense)).toString(),
      realizedPnl: (BigInt(month.realizedPnl) + BigInt(row.realizedPnl)).toString(),
      unpricedIn: month.unpricedIn + row.unpricedIn,
      unpricedOut: month.unpricedOut + row.unpricedOut,
    });
  }
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}

function RealizedRow({
  row,
  expanded,
  onToggle,
  labelFor,
  symbolOf,
  decimalsOf,
  onOpenEvents,
}: {
  row: RealizedEvent;
  expanded: boolean;
  onToggle: () => void;
  labelFor: (address: string) => string;
  symbolOf: (asset: string) => string;
  decimalsOf: (asset: string) => number;
  onOpenEvents: (eventIds: string[]) => void;
}) {
  return (
    <>
      <tr className="border-t border-border">
        <td className="px-4 py-2 whitespace-nowrap">
          {new Date(row.timestamp).toLocaleDateString()}
        </td>
        <td className="px-4 py-2">{labelFor(row.wallet)}</td>
        <td className="px-4 py-2">{symbolOf(row.asset)}</td>
        <td className="px-4 py-2 text-right font-mono">
          {fmtAmount(row.quantity, decimalsOf(row.asset), 6)}
        </td>
        <td className="px-4 py-2 text-right font-mono">{scaled(row.proceeds)}</td>
        <td className="px-4 py-2 text-right font-mono">{scaled(row.cost)}</td>
        <td
          className={`px-4 py-2 text-right font-mono ${row.pnl.startsWith("-") ? "text-red-600" : "text-emerald-700"}`}
        >
          {scaled(row.pnl)}
        </td>
        <td className="px-4 py-2 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {expanded ? "hide lots" : "lots"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={8} className="px-4 py-2">
            <div className="grid gap-1 text-xs">
              {row.consumed.map((leg) => (
                <div key={`${leg.sourceEventId}|${leg.quantity}`} className="flex gap-4">
                  <span className="text-muted-foreground">drew</span>
                  <span className="font-mono">
                    {fmtAmount(leg.quantity, decimalsOf(row.asset), 6)} {symbolOf(row.asset)}
                  </span>
                  <span className="text-muted-foreground">at cost</span>
                  <span className="font-mono">{scaled(leg.cost)}</span>
                  <EventLink onClick={() => onOpenEvents([leg.sourceEventId])}>
                    lot event
                  </EventLink>
                </div>
              ))}
              <div className="flex gap-4">
                <span className="text-muted-foreground">disposed by</span>
                <EventLink onClick={() => onOpenEvents([row.sourceEventId])}>
                  the ledger event
                </EventLink>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function EventLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-primary underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "warning" | "muted";
  children: ReactNode;
}) {
  return (
    <p
      className={`rounded-lg border px-4 py-2 text-xs ${
        tone === "warning"
          ? "border-amber-500/50 bg-amber-500/10 text-amber-700"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {children}
    </p>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-700" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
