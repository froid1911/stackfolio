/**
 * Wallet bundles: group the portfolio's wallets under a name, then pick
 * the bundle in the header to narrow every page to them. The checks
 * mirror the model's (a name, unique ignoring case, at least one wallet)
 * so a form never sends what the reducer would refuse.
 */
import { useState } from "react";
import type { Bundle } from "../lib/bundles.js";
import { short } from "./Dashboard.js";

export interface BundleWallet {
  address: string;
  label: string | null;
}

/** Why a draft can't be saved, or null when it can. */
export function bundleProblem(
  bundles: Bundle[],
  draft: { id: string | null; name: string; addresses: string[] },
): string | null {
  const name = draft.name.trim();
  if (!name) return "Give the bundle a name.";
  if (
    bundles.some((b) => b.id !== draft.id && b.name.toLowerCase() === name.toLowerCase())
  ) {
    return `A bundle named ${name} exists.`;
  }
  if (draft.addresses.length === 0) return "Pick at least one wallet.";
  return null;
}

export function Bundles({
  bundles,
  wallets,
  ready,
  newId,
  onAdd,
  onUpdate,
  onRemove,
}: {
  bundles: Bundle[];
  wallets: BundleWallet[];
  ready: boolean;
  newId: () => string;
  onAdd: (input: { id: string; name: string; addresses: string[] }) => void;
  onUpdate: (input: { id: string; name?: string; addresses?: string[] }) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const labelOf = (address: string) =>
    wallets.find((w) => w.address === address)?.label || short(address);

  return (
    <section className="grid gap-3 px-6 pb-6">
      <div>
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Bundles</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Group wallets, such as long-term and trading, then pick a bundle at the top of
          any page to see only those wallets.
        </p>
      </div>

      {bundles.map((bundle) => (
        <div key={bundle.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <p className="font-medium">{bundle.name}</p>
            <span className="text-xs text-muted-foreground">
              {bundle.addresses.length} wallet{bundle.addresses.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              disabled={!ready}
              onClick={() => onRemove(bundle.id)}
              className="ml-auto rounded border border-border px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              Delete
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {wallets.map((w) => {
              const on = bundle.addresses.includes(w.address);
              // The last wallet stays: an empty bundle is no bundle.
              const locked = on && bundle.addresses.length === 1;
              return (
                <button
                  key={w.address}
                  type="button"
                  aria-pressed={on}
                  disabled={!ready || locked}
                  title={locked ? "A bundle keeps at least one wallet" : w.address}
                  onClick={() =>
                    onUpdate({
                      id: bundle.id,
                      addresses: on
                        ? bundle.addresses.filter((a) => a !== w.address)
                        : [...bundle.addresses, w.address],
                    })
                  }
                  className={
                    on
                      ? "rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground disabled:opacity-80"
                      : "rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                  }
                >
                  {labelOf(w.address)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <form
        className="grid gap-2 rounded-xl border border-dashed border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const draft = { id: null, name, addresses: picked };
          const why = bundleProblem(bundles, draft);
          setProblem(why);
          if (why) return;
          onAdd({ id: newId(), name: name.trim(), addresses: picked });
          setName("");
          setPicked([]);
        }}
      >
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New bundle, e.g. Long term"
            aria-label="Bundle name"
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={!ready}
            className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
          >
            Add bundle
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {wallets.length === 0 && (
            <span className="text-xs text-muted-foreground">Add wallets above first.</span>
          )}
          {wallets.map((w) => {
            const on = picked.includes(w.address);
            return (
              <button
                key={w.address}
                type="button"
                aria-pressed={on}
                title={w.address}
                onClick={() =>
                  setPicked((p) => (on ? p.filter((a) => a !== w.address) : [...p, w.address]))
                }
                className={
                  on
                    ? "rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                    : "rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                }
              >
                {labelOf(w.address)}
              </button>
            );
          })}
        </div>
        {problem && <p className="text-xs text-red-700">{problem}</p>}
      </form>
    </section>
  );
}

/** The header switcher: every wallet, or one bundle. */
export function BundleSwitcher({
  bundles,
  active,
  onPick,
}: {
  bundles: Bundle[];
  active: Bundle | null;
  onPick: (id: string | undefined) => void;
}) {
  if (bundles.length === 0) return null;
  return (
    <label className="mr-auto flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Wallets</span>
      <select
        value={active?.id ?? ""}
        onChange={(e) => onPick(e.target.value || undefined)}
        className={`rounded border px-2 py-1 text-sm ${active ? "border-primary bg-accent font-medium" : "border-border bg-background"}`}
      >
        <option value="">All wallets</option>
        {bundles.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
