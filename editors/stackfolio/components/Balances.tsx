/**
 * The Balances matrix: what the drive holds, per asset, expandable to
 * the wallet rows behind each asset, with an allocation donut. Rows come
 * from the holdings fold (server-side ledger fold; Task 4), totals from
 * the pure buildBalances pivot - the view never re-adds money itself.
 */
import { useState } from "react";
import type { QueryState } from "../lib/graphql.js";
import { fmtFiat } from "../lib/format.js";
import {
  buildBalances,
  type AssetTotal,
  type HoldingsRow,
} from "../../../subgraphs/portfolio-api/lib.js";
import { Donut } from "../lib/charts.js";
import { short } from "./Dashboard.js";

const HUE = [
  "text-c1",
  "text-c2",
  "text-c3",
  "text-c4",
  "text-c5",
  "text-c6",
];

/** "12240162.1270714" as a compact figure for the donut's center. */
function compact(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function Balances({
  holdings,
  onOpenAsset,
  onOpenAccount,
}: {
  holdings: QueryState<{
    holdings: HoldingsRow[];
    perAsset: (AssetTotal & { symbol: string })[];
    perAccount: { wallet: string; ensName: string | null; label: string | null; value: string }[];
    total: string;
  } | null>;
  onOpenAsset: (assetId: string) => void;
  onOpenAccount: (address: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const data = holdings.data;
  const rows = data?.holdings ?? [];
  const totals = data ? buildBalances(data.holdings) : null;

  if (holdings.loading && !data) {
    return <div className="p-6 text-muted-foreground">Loading balances…</div>;
  }
  if (holdings.error) {
    return <div className="p-6 text-sm text-red-700">{holdings.error}</div>;
  }
  if (!data || rows.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Nothing held yet - import a wallet to see balances.
      </div>
    );
  }

  const symbolOf = new Map(data.perAsset.map((a) => [a.asset, a.symbol]));
  const walletName = new Map(
    data.perAccount.map((a) => [a.wallet, a.ensName || a.label || short(a.wallet)]),
  );

  // Donut over the valued per-asset totals, top 8 plus Other.
  const valued = (totals?.perAsset ?? []).filter((a) => a.value !== null);
  const sorted = [...valued].sort(
    (a, b) => Number(b.value) - Number(a.value),
  );
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8).reduce((acc, a) => acc + Number(a.value), 0);
  const slices = [
    ...top.map((a, i) => ({
      label: symbolOf.get(a.asset) ?? a.asset,
      value: Number(a.value),
      color: HUE[i % HUE.length],
    })),
    ...(rest > 0 ? [{ label: "Other", value: rest, color: "text-muted-foreground" }] : []),
  ];

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto]">
      <div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {(totals?.perAsset ?? []).map((asset) => {
                const symbol = symbolOf.get(asset.asset) ?? asset.asset;
                const share =
                  asset.value !== null && Number(data.total) > 0
                    ? `${((Number(asset.value) / Number(data.total)) * 100).toFixed(1)}%`
                    : "—";
                const open = expanded.has(asset.asset);
                const assetRows = rows.filter((r) => r.asset === asset.asset);
                return (
                  <FragmentRows
                    key={asset.asset}
                    asset={asset}
                    symbol={symbol}
                    share={share}
                    open={open}
                    onToggle={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(asset.asset)) next.delete(asset.asset);
                        else next.add(asset.asset);
                        return next;
                      })
                    }
                    onOpenAsset={() => onOpenAsset(asset.asset)}
                    assetRows={assetRows}
                    walletName={walletName}
                    onOpenAccount={onOpenAccount}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{fmtFiat(data.total)}</td>
                <td className="px-3 py-2 text-right">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="lg:pt-2">
        <Donut slices={slices} center={compact(data.total)} sub="total value" />
        {data.perAccount.length > 0 && (
          <ul className="mt-4 grid gap-1 text-xs">
            {data.perAccount.map((a) => (
              <li key={a.wallet} className="flex justify-between gap-4">
                <button
                  type="button"
                  className="text-left text-accent underline-offset-2 hover:underline"
                  onClick={() => onOpenAccount(a.wallet)}
                >
                  {walletName.get(a.wallet)}
                </button>
                <span className="tabular-nums">{fmtFiat(a.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FragmentRows({
  asset,
  symbol,
  share,
  open,
  onToggle,
  onOpenAsset,
  assetRows,
  walletName,
  onOpenAccount,
}: {
  asset: AssetTotal;
  symbol: string;
  share: string;
  open: boolean;
  onToggle: () => void;
  onOpenAsset: () => void;
  assetRows: HoldingsRow[];
  walletName: Map<string, string>;
  onOpenAccount: (address: string) => void;
}) {
  const quantity = asset.quantity;
  return (
    <>
      <tr className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={onToggle}>
        <td className="px-3 py-2">
          <span className="mr-1 text-muted-foreground">{open ? "▾" : "▸"}</span>
          <button
            type="button"
            className="font-medium hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAsset();
            }}
          >
            {symbol}
          </button>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{quantity}</td>
        <td className="px-3 py-2 text-right tabular-nums">
          {asset.value === null ? (
            <span className="text-muted-foreground" title="unpriced - no value counted">
              —
            </span>
          ) : (
            fmtFiat(asset.value)
          )}
        </td>
        <td className="px-3 py-2 text-right text-muted-foreground">{share}</td>
      </tr>
      {open &&
        assetRows.map((row) => (
          <tr key={`${row.asset}/${row.wallet}`} className="border-t border-border/50 bg-muted/20">
            <td className="px-3 py-1.5 pl-8">
              <button
                type="button"
                className="text-accent underline-offset-2 hover:underline"
                onClick={() => onOpenAccount(row.wallet)}
              >
                {walletName.get(row.wallet) ?? short(row.wallet)}
              </button>
            </td>
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">
              {row.quantity}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {row.value === null ? "—" : fmtFiat(row.value)}
            </td>
            <td className="px-3 py-1.5" />
          </tr>
        ))}
    </>
  );
}
