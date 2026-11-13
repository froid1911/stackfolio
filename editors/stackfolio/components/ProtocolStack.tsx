/**
 * Where the money sits: the wallet, each protocol and the beacon chain as
 * one card each, with its own net, summing to the portfolio total. The
 * model is lib/stack.ts; this only draws it.
 */
import { useState } from "react";
import type { Stack, StackGroup, StackLine } from "../lib/stack.js";
import { formatQuantity } from "../lib/assets.js";
import { money } from "./Dashboard.js";

/** Rows under this value fold away while "hide small balances" is on. */
const SMALL = 10;
const WALLET_ROWS = 8;

export function ProtocolStack({
  stack,
  currency,
  onOpenAsset,
}: {
  stack: Stack;
  currency: string;
  onOpenAsset: (assetId: string) => void;
}) {
  const [hideSmall, setHideSmall] = useState(true);
  const eur = (v: number) => money(v.toFixed(2), currency);
  const wallet = stack.groups.find((g) => g.kind === "wallet");
  const others = stack.groups.filter((g) => g.kind !== "wallet");
  const debt = others.reduce(
    (sum, g) => sum + g.borrowed.reduce((s, l) => s + (l.value ?? 0), 0),
    0,
  );

  return (
    <section aria-label="Where your money sits" className="grid gap-4">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Net worth</p>
          <p className="text-3xl font-semibold tabular-nums">{eur(stack.total)}</p>
        </div>
        {stack.groups.map((g) => (
          <div key={g.id}>
            <p className="text-xs text-muted-foreground">{g.label}</p>
            <p className="text-lg font-medium tabular-nums">{eur(g.net)}</p>
          </div>
        ))}
        {debt > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">of which borrowed</p>
            <p className="text-lg font-medium tabular-nums text-red-700">−{eur(debt)}</p>
          </div>
        )}
        <label className="ml-auto flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hideSmall}
            onChange={(e) => setHideSmall(e.target.checked)}
            className="h-4 w-4"
          />
          Hide balances under {money(String(SMALL), currency)}
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {wallet && (
          <WalletCard group={wallet} hideSmall={hideSmall} eur={eur} onOpenAsset={onOpenAsset} />
        )}
        <div className="grid content-start gap-4">
          {others.map((g) =>
            g.kind === "protocol" ? (
              <ProtocolCard key={g.id} group={g} eur={eur} onOpenAsset={onOpenAsset} />
            ) : (
              <StakingCard key={g.id} group={g} eur={eur} />
            ),
          )}
          {others.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No protocol positions or validators yet — the positions sweep and the
              staking read fill these in.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Card({ group, eur, children }: { group: StackGroup; eur: (v: number) => string; children: React.ReactNode }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          {group.label} <span className="text-sm font-normal text-muted-foreground">{group.sub}</span>
        </h3>
        <span className="text-base font-semibold tabular-nums">{eur(group.net)}</span>
      </header>
      {children}
      {group.unpriced > 0 && (
        <p className="mt-2 text-xs text-warning">
          {group.unpriced} without a price — not in this figure
        </p>
      )}
    </article>
  );
}

function Row({ line, eur, onOpen }: { line: StackLine; eur: (v: number) => string; onOpen?: () => void }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0">
      {onOpen ? (
        <button type="button" onClick={onOpen} className="text-left font-medium text-primary underline-offset-2 hover:underline">
          {line.symbol}
        </button>
      ) : (
        <span className="font-medium">{line.symbol}</span>
      )}
      <span className="ml-auto tabular-nums text-muted-foreground">{formatQuantity(line.quantity)}</span>
      <span className="w-32 text-right tabular-nums">{line.value === null ? "no price" : eur(line.value)}</span>
    </li>
  );
}

function WalletCard({
  group,
  hideSmall,
  eur,
  onOpenAsset,
}: {
  group: StackGroup;
  hideSmall: boolean;
  eur: (v: number) => string;
  onOpenAsset: (assetId: string) => void;
}) {
  const [all, setAll] = useState(false);
  // Small or unpriced rows fold away; the card still counts the unpriced.
  const shown = hideSmall
    ? group.lines.filter((l) => l.value !== null && Math.abs(l.value) >= SMALL)
    : group.lines;
  const visible = all ? shown : shown.slice(0, WALLET_ROWS);
  const folded = group.lines.length - visible.length;
  const { spam, debt, negative } = group.hidden;
  return (
    <Card group={group} eur={eur}>
      <ul className="mt-2 text-sm">
        {visible.map((l) => (
          <Row key={l.asset} line={l} eur={eur} onOpen={() => onOpenAsset(l.asset)} />
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {folded > 0 && (
          <button type="button" onClick={() => setAll((v) => !v)} className="font-medium text-primary underline-offset-2 hover:underline">
            {all ? "Show fewer" : `Show ${folded} more`}
          </button>
        )}
        {negative > 0 && <span>{negative} below zero (ledger gaps, counted)</span>}
        {debt > 0 && <span>{debt} debt tokens listed on Balances</span>}
        {spam > 0 && <span>{spam} suspected spam hidden</span>}
      </p>
    </Card>
  );
}

function ProtocolCard({
  group,
  eur,
  onOpenAsset,
}: {
  group: StackGroup;
  eur: (v: number) => string;
  onOpenAsset: (assetId: string) => void;
}) {
  const total = (lines: StackLine[]) => lines.reduce((s, l) => s + (l.value ?? 0), 0);
  return (
    <Card group={group} eur={eur}>
      {group.health !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          Health factor{" "}
          <span className={`font-semibold ${group.health < 1.2 ? "text-red-700" : group.health < 2 ? "text-warning" : "text-success"}`}>
            {group.health.toFixed(2)}
          </span>{" "}
          · liquidation at 1.00
        </p>
      )}
      <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-success">Supplied · {eur(total(group.supplied))}</p>
          <ul className="mt-1">
            {group.supplied.map((l) => (
              <Row key={l.asset} line={l} eur={eur} onOpen={() => onOpenAsset(l.asset)} />
            ))}
          </ul>
        </div>
        {group.borrowed.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-red-700">Borrowed · {eur(total(group.borrowed))}</p>
            <ul className="mt-1">
              {group.borrowed.map((l) => (
                <Row key={l.asset} line={l} eur={eur} onOpen={() => onOpenAsset(l.asset)} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function StakingCard({ group, eur }: { group: StackGroup; eur: (v: number) => string }) {
  const eth = group.lines.reduce((s, l) => s + Number(l.quantity), 0);
  return (
    <Card group={group} eur={eur}>
      <p className="mt-1 text-sm">
        {group.lines.length} validator{group.lines.length === 1 ? "" : "s"} · {eth.toFixed(4)} ETH staked
      </p>
      <ul className="mt-2 text-sm">
        {group.lines.map((l) => (
          <Row key={l.symbol} line={{ ...l, quantity: Number(l.quantity).toFixed(4) }} eur={eur} />
        ))}
      </ul>
    </Card>
  );
}
