/**
 * The asset detail overlay: one asset's holdings (folded, per wallet),
 * its price history, and the manual price override. It reads only index
 * rows and the portfolio document - the URL's slug resolved upstream
 * (lib/detail.ts), so a stale link shows a not-found affordance, never
 * a wrong asset.
 */
import { useMemo, useState } from "react";
import { useHoldings, useOverrides, usePriceHistory } from "../lib/graphql.js";
import { usePortfolioActions } from "../lib/mutations.js";
import { fmtFiat } from "../lib/format.js";
import { formatUnitPrice } from "../lib/assets.js";
import { ValueHistory } from "../lib/echart.js";
import { short } from "./Dashboard.js";

export function AssetDetail({
  driveId,
  assetId,
  portfolioId,
  onClose,
}: {
  driveId: string;
  assetId: string;
  /** The portfolio document (overrides dispatch there); the index reads
   * are drive-wide. */
  portfolioId: string | undefined;
  onClose: () => void;
}) {
  const holdings = useHoldings(driveId);
  const history = usePriceHistory(driveId, assetId);
  const overrides = useOverrides(driveId);
  const portfolio = usePortfolioActions(portfolioId);
  const [price, setPrice] = useState("");

  const asset = holdings.data?.perAsset.find((a) => a.asset === assetId);
  const rows = useMemo(
    () => (holdings.data?.holdings ?? []).filter((h) => h.asset === assetId),
    [holdings.data, assetId],
  );
  const walletName = new Map(
    (holdings.data?.perAccount ?? []).map((a) => [
      a.wallet,
      a.ensName || a.label || short(a.wallet),
    ]),
  );
  const series = [...(history.data ?? [])].sort((a, b) => a.hour.localeCompare(b.hour));
  const points = series.map((p) => ({ at: p.hour, value: Number(p.price) || 0 }));
  const override = (overrides.data ?? []).find((o) => o.asset === assetId);

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">
            {asset?.symbol ?? assetId.slice(0, 16)}
            {asset && asset.symbol !== assetId ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{assetId}</span>
            ) : null}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {asset
              ? `${asset.quantity} held · ${asset.value === null ? "unpriced" : fmtFiat(asset.value)}`
              : "Nothing held in this portfolio."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
        >
          ✕
        </button>
      </div>

      {asset ? (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5">Wallet</th>
                <th className="px-3 py-1.5 text-right">Quantity</th>
                <th className="px-3 py-1.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.wallet} className="border-t border-border">
                  <td className="px-3 py-1.5">{walletName.get(r.wallet) ?? short(r.wallet)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.value === null ? "—" : fmtFiat(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">Price history</h3>
        {points.length > 1 ? (
          <ValueHistory
            points={points}
            formatValue={(v) => formatUnitPrice(String(v))}
            ariaLabel="asset price history"
          />
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No price history {asset ? "for this asset" : ""}.
          </p>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Manual price {override ? `(override: ${override.price})` : ""}
        </h3>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            placeholder="price in the portfolio currency"
            className="w-52 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <button
            type="button"
            disabled={!portfolio.ready || !/^\d+(\.\d+)?$/.test(price)}
            onClick={() => {
              portfolio.setPriceOverride({
                asset: assetId,
                price,
                setAt: new Date().toISOString(),
              });
              setPrice("");
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
          >
            Set price
          </button>
          {override && (
            <button
              type="button"
              disabled={!portfolio.ready}
              onClick={() => portfolio.removePriceOverride(assetId)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              Remove override
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
