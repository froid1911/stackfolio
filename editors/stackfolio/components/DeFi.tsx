/**
 * The DeFi section: what the wallets hold inside protocols (the
 * reconciler's fetch-positions fills these in from the chain), and what
 * the portfolio owes. Positions live on the portfolio document, not the
 * index — this reads the document state the app already has open.
 */
import type { Asset, Price } from "../lib/graphql.js";
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
  prices,
  currency,
  walletLabel,
}: {
  positions: DocWalletPositions[];
  latestSnapshot: DocSnapshot | undefined;
  assets: Asset[];
  prices: Price[];
  currency: string;
  walletLabel: (address: string) => string;
}) {
  const assetInfo = new Map(assets.map((a) => [a.identifier, a]));
  const symbolOf = (id: string): string => assetInfo.get(id)?.symbol ?? id.split("/").pop() ?? id;
  const decimalsOf = (id: string): number => assetInfo.get(id)?.decimals ?? 18;
  const priceOf = new Map(prices.map((p) => [p.asset, p]));

  // Aave-style borrows live on the positions (negative asset amounts), not
  // in the ledger, so the debts the DeFi view owes the user are computed
  // from positions; the snapshot's own liabilities (registry kind DEBT rows)
  // are added on top when the snapshot carries them.
  const debtAmounts = new Map<string, bigint>();
  for (const entry of positions) {
    for (const position of entry.positions) {
      for (const held of position.assets) {
        const amount = BigInt(held.amount);
        if (amount < 0n) {
          debtAmounts.set(held.asset, (debtAmounts.get(held.asset) ?? 0n) - amount);
        }
      }
    }
  }
  const snapshotDebts = latestSnapshot?.liabilities ?? [];
  const liabilityCount = debtAmounts.size + snapshotDebts.length;

  const positionDebtValue = priceDebts(debtAmounts, priceOf, decimalsOf);
  // The snapshot's debts were valued when it was taken (total − net worth).
  const snapshotDebtValue =
    latestSnapshot?.netWorth !== null &&
    latestSnapshot?.netWorth !== undefined &&
    snapshotDebts.length > 0
      ? parse8(latestSnapshot.totalValue) - parse8(latestSnapshot.netWorth)
      : null;
  const debtsPriced =
    (debtAmounts.size === 0 || positionDebtValue !== null) &&
    (snapshotDebts.length === 0 || snapshotDebtValue !== null);
  const liabilityValue8 = debtsPriced
    ? (positionDebtValue ?? 0n) + (snapshotDebtValue ?? 0n)
    : null;
  const totalValue8 = latestSnapshot ? parse8(latestSnapshot.totalValue) : null;
  const netWorth =
    liabilityValue8 !== null && totalValue8 !== null
      ? scaledString(totalValue8 - liabilityValue8)
      : latestSnapshot?.netWorth ??
        (latestSnapshot ? latestSnapshot.totalValue : undefined);

  if (positions.length === 0 && liabilityCount === 0) {
    return (
      <section className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">DeFi</p>
        <p className="mt-1 text-xs">
          No protocol positions or debts yet — the reconciler's position
          sweep fills this in from the chain.
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
              liabilityValue8 === null
                ? "—"
                : liabilityValue8 === 0n
                  ? "0"
                  : `${money(scaledString(liabilityValue8), currency)}${
                      // A debt with no price row is excluded from the value;
                      // a trailing + says the number is a floor, not the truth.
                      debtAmounts.size > 0 &&
                      [...debtAmounts.keys()].some((id) => !priceOf.get(id)?.price)
                        ? " +"
                        : ""
                    }`
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
            Debts
          </p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Asset</th>
                <th className="px-4 py-2 text-right">Owed</th>
                <th className="px-4 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...[...debtAmounts.entries()].map(([asset, owed]) => ({
                  asset,
                  amount: `-${owed}`,
                  source: "position",
                })),
                ...snapshotDebts
                  .filter((debt) => !debtAmounts.has(debt.asset))
                  .map((debt) => ({ ...debt, source: "snapshot" })),
              ].map((debt) => {
                const price = priceOf.get(debt.asset)?.price;
                const owed = -BigInt(debt.amount);
                const price8 = price === undefined ? null : parse8(price);
                return (
                  <tr key={debt.asset} className="border-t border-border">
                    <td className="px-4 py-2">
                      {symbolOf(debt.asset)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({debt.source})
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {fmtAmount(debt.amount, decimalsOf(debt.asset), 4)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                      {price8 === null
                        ? "—"
                        : money(
                            scaledString((owed * price8) / 10n ** BigInt(decimalsOf(debt.asset))),
                            currency,
                          )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** A price or total as 8-scaled integer units; unparseable input is 0 so a
 * missing value can never fabricate a positive one. */
function parse8(value: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) return 0n;
  return BigInt((match[1] ?? "0") + (match[2] ?? "").padEnd(8, "0").slice(0, 8));
}

/** 8-scaled units back to a decimal string. */
function scaledString(scaled: bigint): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(9, "0");
  const int = digits.slice(0, -8).replace(/^0+(?=\d)/, "");
  const frac = digits.slice(-8).replace(/0+$/, "");
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/** Sum of position debts priced at their latest price, 8-scaled; null when
 * any debt asset has no price — a floor is shown, never a guess. */
function priceDebts(
  debtAmounts: Map<string, bigint>,
  priceOf: Map<string, Price>,
  decimalsOf: (id: string) => number,
): bigint | null {
  let total = 0n;
  for (const [asset, owed] of debtAmounts) {
    const price = priceOf.get(asset)?.price;
    const price8 = price === undefined ? null : parse8(price);
    if (price8 === null || price8 === 0n) return null;
    total += (owed * price8) / 10n ** BigInt(decimalsOf(asset));
  }
  return total;
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
