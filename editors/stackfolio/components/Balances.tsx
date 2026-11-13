/**
 * The Balances matrix: what the drive holds, per asset, expandable to the
 * wallet rows behind each asset. Rows come from the holdings fold; totals
 * from the pure buildBalances pivot - the view never re-adds money itself.
 *
 * Trust is a presentation policy: valued rows make the totals, unvalued
 * holdings are listed separately with their quantity and a reason, and
 * spoofed tickers never contribute. A toggle keeps both visible.
 */
import { Fragment, useState } from "react";
import type { Asset, QueryState } from "../lib/graphql.js";
import {
  allocate,
  ambiguousTicker,
  assetBook,
  chainOf,
  coverage,
  formatQuantity,
  nameOf,
  symbolOf,
} from "../lib/assets.js";
import { fmtFiat } from "../lib/format.js";
import {
  buildBalances,
  type AssetTotal,
  type HoldingsRow,
} from "../../../subgraphs/portfolio-api/lib.js";
import { Donut } from "../lib/echart.js";
import { short } from "./Dashboard.js";

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
  assets,
  holdings,
  onOpenAsset,
  onOpenAccount,
  onCloseAccount,
}: {
  assets: QueryState<Asset[]>;
  holdings: QueryState<{
    holdings: HoldingsRow[];
    perAsset: (AssetTotal & { symbol: string })[];
    perAccount: { wallet: string; ensName: string | null; label: string | null; value: string }[];
    total: string;
  } | null>;
  onOpenAsset: (assetId: string) => void;
  onOpenAccount: (address: string) => void;
  /** Closes an open account overlay (the expanded view closes it too). */
  onCloseAccount?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showUnpriced, setShowUnpriced] = useState(false);
  const [showSpam, setShowSpam] = useState(false);
  const data = holdings.data;
  const rows = data?.holdings ?? [];
  const totals = data ? buildBalances(data.holdings) : null;
  const book = assetBook(assets.data ?? [], rows.filter((r) => r.value !== null).map((r) => r.asset));
  const cov = coverage(rows, data?.total ?? null);

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

  const tierOf = (identifier: string) =>
    book.rows.find((r) => r.asset.identifier === identifier);

  const alloc = allocate(totals?.perAsset ?? [], book);
  const { valued: sorted, unpriced, spam, debt, slices } = alloc;
  const walletName = new Map(
    (data.perAccount ?? []).map((a) => [a.wallet, a.ensName || a.label || short(a.wallet)]),
  );

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
            {cov.pricedAssets}/{cov.assets} assets priced
          </span>
          {unpriced.length > 0 && (
            <button
              type="button"
              onClick={() => setShowUnpriced((v) => !v)}
              className="rounded-full border border-warning/40 bg-warning/5 px-2 py-0.5 text-warning hover:bg-warning/10"
            >
              {unpriced.length} unpriced · {showUnpriced ? "hide" : "show"}
            </button>
          )}
          {debt.length > 0 && (
            <span className="rounded-full border border-red-500/40 bg-red-500/5 px-2 py-0.5 text-red-700">
              {debt.length} debt position{debt.length === 1 ? "" : "s"} · not netted
            </span>
          )}
          {spam.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSpam((v) => !v)}
              className="rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:bg-muted"
            >
              {spam.length} suspected spam · {showSpam ? "hide" : "show"}
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Chain</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((asset) => {
                const view = tierOf(asset.asset);
                const fraction = alloc.share(asset.asset);
                const share = fraction === null ? "—" : `${(fraction * 100).toFixed(1)}%`;
                return (
                  <FragmentRows
                    key={asset.asset}
                    asset={asset}
                    symbol={symbolOf(book.byId, asset.asset)}
                    name={nameOf(book.byId, asset.asset)}
                    chain={chainOf(book.byId, asset.asset)}
                    ambiguous={view ? ambiguousTicker(view) : false}
                    verified={view?.tier === "verified"}
                    share={share}
                    open={expanded.has(asset.asset)}
                    onToggle={() => {
                      onCloseAccount?.();
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(asset.asset)) next.delete(asset.asset);
                        else next.add(asset.asset);
                        return next;
                      });
                    }}
                    onOpenAsset={() => onOpenAsset(asset.asset)}
                    assetRows={rows.filter((r) => r.asset === asset.asset)}
                    walletName={walletName}
                    onOpenAccount={onOpenAccount}
                  />
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Nothing valued yet — the unpriced holdings below carry the
                    quantity but no price.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="px-3 py-2">Total (valued)</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums">{fmtFiat(alloc.total)}</td>
                <td className="px-3 py-2 text-right">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {debt.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-red-500/30 bg-red-500/5">
            <p className="px-3 pt-3 text-xs font-medium text-red-700">
              Debt — listed, not subtracted from the total
            </p>
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {debt.map((asset) => (
                  <tr key={asset.asset} className="border-t border-red-500/20">
                    <td className="px-3 py-1.5 font-medium">{symbolOf(book.byId, asset.asset)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {chainOf(book.byId, asset.asset)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatQuantity(asset.quantity)} owed
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showUnpriced && unpriced.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-warning/30 bg-warning/5">
            <p className="px-3 pt-3 text-xs font-medium text-warning">
              Unpriced holdings — excluded from totals and allocation
            </p>
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5">Asset</th>
                  <th className="px-3 py-1.5">Chain</th>
                  <th className="px-3 py-1.5 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {unpriced.map((asset) => (
                  <tr key={asset.asset} className="border-t border-warning/20">
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{symbolOf(book.byId, asset.asset)}</span>{" "}
                      <span className="text-muted-foreground">
                        {nameOf(book.byId, asset.asset)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {chainOf(book.byId, asset.asset)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatQuantity(asset.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showSpam && spam.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <p className="px-3 pt-3 text-xs font-medium text-muted-foreground">
              Suspected spam — never counted
            </p>
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {spam.map((asset) => (
                  <tr key={asset.asset} className="border-t border-border/60">
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{symbolOf(book.byId, asset.asset)}</span>{" "}
                      <span className="text-muted-foreground">
                        {nameOf(book.byId, asset.asset)}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {formatQuantity(asset.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="lg:pt-2">
        <Donut
          slices={slices}
          center={compact(alloc.total)}
          sub="valued holdings"
          formatValue={(v) => fmtFiat(v.toFixed(2))}
        />
        {data.perAccount.length > 0 && (
          <ul className="mt-4 grid gap-1 text-xs">
            {data.perAccount.map((a) => (
              <li key={a.wallet} className="flex justify-between gap-4">
                <button
                  type="button"
                  className="text-left text-primary underline-offset-2 hover:underline"
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
  name,
  chain,
  ambiguous,
  verified,
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
  name: string;
  chain: string;
  ambiguous: boolean;
  verified: boolean;
  share: string;
  open: boolean;
  onToggle: () => void;
  onOpenAsset: () => void;
  assetRows: HoldingsRow[];
  walletName: Map<string, string>;
  onOpenAccount: (address: string) => void;
}) {
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
          </button>{" "}
          <span className="text-muted-foreground">{name}</span>
          {verified && (
            <span className="ml-1 rounded-full border border-success/40 px-1.5 text-[10px] text-success">
              verified
            </span>
          )}
          {ambiguous && (
            <span
              className="ml-1 rounded-full border border-warning/40 px-1.5 text-[10px] text-warning"
              title="Another token uses this ticker; the price may belong to a different contract"
            >
              ambiguous ticker
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-muted-foreground">{chain}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatQuantity(asset.quantity)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtFiat(asset.value)}</td>
        <td className="px-3 py-2 text-right text-muted-foreground">{share}</td>
      </tr>
      {open &&
        assetRows.map((row) => (
          <tr key={`${row.asset}/${row.wallet}`} className="border-t border-border/50 bg-muted/20">
            <td className="px-3 py-1.5 pl-8">
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAsset();
                }}
              >
                {walletName.get(row.wallet) ?? short(row.wallet)}
              </button>
            </td>
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5 text-right text-xs tabular-nums">
              {formatQuantity(row.quantity)}
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
