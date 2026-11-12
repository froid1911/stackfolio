/**
 * The DeFi section: what the wallets hold inside protocols (the
 * reconciler's fetch-positions fills these in from the chain), and what
 * the portfolio owes. Positions live on the portfolio document, not the
 * index — this reads the document state the app already has open.
 */
import type { Asset } from "../lib/graphql.js";
import { fmtAmount } from "../lib/format.js";
import { money } from "./Dashboard.js";

/** The portfolio document's own shapes (its Snapshot carries what the
 * index row drops: liabilities and net worth). */
export interface DocPositionAsset {
  asset: string;
  amount: string;
}

export interface DocPosition {
  protocol: string;
  kind: string;
  assets: DocPositionAsset[];
  note: string | null;
}

export interface DocWalletPositions {
  wallet: string;
  chainId: number;
  fetchedAt: string;
  positions: DocPosition[];
}

export interface DocSnapshot {
  timestamp: string;
  totalValue: string;
  netWorth: string | null;
  liabilities: { asset: string; amount: string }[] | null;
}

export function DeFi({
  positions,
  latestSnapshot,
  assets,
  currency,
  walletLabel,
}: {
  positions: DocWalletPositions[];
  latestSnapshot: DocSnapshot | undefined;
  assets: Asset[];
  currency: string;
  walletLabel: (address: string) => string;
}) {
  const assetInfo = new Map(assets.map((a) => [a.identifier, a]));
  const symbolOf = (id: string): string => assetInfo.get(id)?.symbol ?? id.split("/").pop() ?? id;
  const decimalsOf = (id: string): number => assetInfo.get(id)?.decimals ?? 18;

  const liabilities = latestSnapshot?.liabilities ?? [];
  const liabilityCount = liabilities.length;
  const netWorth =
    latestSnapshot?.netWorth ??
    (latestSnapshot?.totalValue !== undefined && latestSnapshot !== undefined
      ? latestSnapshot.totalValue
      : undefined);

  if (positions.length === 0 && liabilityCount === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">DeFi</p>
        <p className="mt-1 text-xs">
          No protocol positions or debts yet — the reconciler's position
          sweep fills this in from the chain, and debt assets (registry kind
          DEBT) land in the nightly snapshot.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      {latestSnapshot && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card label="Assets" value={money(latestSnapshot.totalValue, currency)} />
          <Card
            label="Liabilities"
            value={
              liabilities.length > 0
                ? subtract(latestSnapshot.totalValue, netWorth ?? "0")
                : "0"
            }
          />
          <Card label="Net worth" value={money(netWorth ?? null, currency)} />
        </div>
      )}

      {positions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs uppercase text-muted-foreground">
            Positions by protocol
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Wallet</th>
                <th className="px-4 py-2">Protocol</th>
                <th className="px-4 py-2">Kind</th>
                <th className="px-4 py-2">Assets</th>
                <th className="px-4 py-2 text-right">Fetched</th>
              </tr>
            </thead>
            <tbody>
              {positions.flatMap((entry) =>
                entry.positions.map((position) => (
                  <tr
                    key={`${entry.wallet}|${entry.chainId}|${position.protocol}|${position.kind}|${position.note ?? ""}`}
                    className="border-t border-border"
                  >
                    <td className="px-4 py-2">
                      {walletLabel(entry.wallet)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        @{entry.chainId}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium">{position.protocol}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {position.kind.toLowerCase()}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {position.assets.length === 0
                        ? "—"
                        : position.assets
                            .map(
                              (a) =>
                                `${fmtAmount(a.amount, decimalsOf(a.asset), 4)} ${symbolOf(a.asset)}`,
                            )
                            .join(" + ")}
                      {position.note && (
                        <span className="ml-2 text-muted-foreground">
                          ({position.note})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {new Date(entry.fetchedAt).toLocaleDateString()}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      {liabilityCount > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs uppercase text-muted-foreground">
            Debts (from the {new Date(latestSnapshot?.timestamp ?? "").toLocaleDateString()} snapshot)
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Asset</th>
                <th className="px-4 py-2 text-right">Owed</th>
              </tr>
            </thead>
            <tbody>
              {liabilities.map((debt) => (
                <tr key={debt.asset} className="border-t border-border">
                  <td className="px-4 py-2">{symbolOf(debt.asset)}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {fmtAmount(debt.amount, decimalsOf(debt.asset), 4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Plain decimal fiat strings, for a card caption only. */
function subtract(a: string, b: string): string {
  const value = Number(a) - Number(b);
  return Number.isFinite(value) ? value.toFixed(2) : "—";
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

/** Used by the Assets view: the same positions read as exposure per
 * protocol, without the wallet column. */
export function PositionsByProtocol({
  positions,
  assets,
}: {
  positions: DocWalletPositions[];
  assets: Asset[];
}) {
  const assetInfo = new Map(assets.map((a) => [a.identifier, a]));
  const symbolOf = (id: string): string =>
    assetInfo.get(id)?.symbol ?? id.split("/").pop() ?? id;
  const decimalsOf = (id: string): number => assetInfo.get(id)?.decimals ?? 18;
  if (positions.length === 0) return null;

  const totals = new Map<string, Map<string, bigint>>();
  for (const entry of positions) {
    for (const position of entry.positions) {
      const byAsset = totals.get(position.protocol) ?? new Map<string, bigint>();
      for (const held of position.assets) {
        byAsset.set(held.asset, (byAsset.get(held.asset) ?? 0n) + BigInt(held.amount));
      }
      totals.set(position.protocol, byAsset);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {[...totals.entries()].map(([protocol, byAsset]) => (
        <div
          key={protocol}
          className="rounded-lg border border-border px-3 py-2 text-xs"
        >
          <span className="font-semibold">{protocol}</span>{" "}
          <span className="font-mono text-muted-foreground">
            {[...byAsset.entries()]
              .map(
                ([asset, amount]) =>
                  `${fmtAmount(amount.toString(), decimalsOf(asset), 4)} ${symbolOf(asset)}`,
              )
              .join(" + ") || "no tokens"}
          </span>
        </div>
      ))}
    </div>
  );
}
