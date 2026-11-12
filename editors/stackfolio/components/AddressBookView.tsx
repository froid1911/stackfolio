/**
 * The address book: the portfolio document's address entries, editable.
 * All writes go through the portfolio actions (Task 3's builders); the
 * view itself holds no data. A `?detail=account:<slug>` deep link either
 * highlights the entry or - when the address is not in the book - hands
 * the add form the address prefilled.
 */
import { useState } from "react";
import { generateId } from "document-model";
import { short } from "./Dashboard.js";

export interface AddressEntry {
  id: string;
  address: string;
  chainId: number;
  label: string | null;
  ensName: string | null;
  ignored: boolean;
  addedAt: string;
}

export function AddressBookView({
  entries,
  loading,
  portfolioReady,
  onAdd,
  onUpdate,
  onRemove,
  onIgnore,
  deepLink,
}: {
  entries: AddressEntry[];
  loading: boolean;
  portfolioReady: boolean;
  onAdd: (draft: {
    id: string;
    address: string;
    chainId: number;
    label?: string;
    ensName?: string;
    timestamp: string;
  }) => void;
  onUpdate: (fields: { id: string; label?: string; ensName?: string }) => void;
  onRemove: (id: string) => void;
  onIgnore: (id: string, ignored: boolean) => void;
  deepLink?: { address: string; resolved: boolean } | undefined;
}) {
  const [draft, setDraft] = useState({ address: deepLink?.address ?? "", label: "", ens: "" });
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const disabled = !portfolioReady;

  return (
    <div className="p-6">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({
            id: generateId(),
            address: draft.address,
            chainId: 1,
            ...(draft.label.trim() ? { label: draft.label } : {}),
            ...(draft.ens.trim() ? { ensName: draft.ens } : {}),
            timestamp: new Date().toISOString(),
          });
          setDraft({ address: "", label: "", ens: "" });
        }}
      >
        <input
          className="w-64 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          placeholder="address (0x…)"
          value={draft.address}
          onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
        />
        <input
          className="w-36 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          placeholder="label"
          value={draft.label}
          onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
        />
        <input
          className="w-36 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
          placeholder="ens (.eth)"
          value={draft.ens}
          onChange={(e) => setDraft((d) => ({ ...d, ens: e.target.value }))}
        />
        <button
          type="submit"
          disabled={disabled || !/^0x[0-9a-fA-F]{4,}$/.test(draft.address.trim())}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
        >
          Add address
        </button>
      </form>

      {deepLink && !deepLink.resolved && (
        <p className="mt-2 text-xs text-muted-foreground">
          <code className="rounded bg-muted px-1">{deepLink.address}</code> is not in this
          portfolio - the form above is prefilled; add it to track it.
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-muted-foreground">Loading the address book…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">ENS</th>
                <th className="px-3 py-2">Chain</th>
                <th className="px-3 py-2">Added</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-t border-border ${
                    deepLink?.resolved && deepLink.address === entry.address ? "ring-1 ring-inset ring-accent" : ""
                  }`}
                >
                  <td className="px-3 py-2 font-mono">
                    {entry.address}
                    {entry.ignored && (
                      <span className="ml-2 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
                        ignored
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {renaming?.id === entry.id ? (
                      <span className="flex items-center gap-1">
                        <input
                          className="w-28 rounded border border-border bg-background px-1 py-0.5 text-xs"
                          value={renaming.label}
                          onChange={(e) => setRenaming({ id: entry.id, label: e.target.value })}
                        />
                        <button
                          type="button"
                          title="save"
                          onClick={() => {
                            onUpdate({ id: entry.id, label: renaming.label });
                            setRenaming(null);
                          }}
                        >
                          ✓
                        </button>
                        <button type="button" title="cancel" onClick={() => setRenaming(null)}>
                          ✕
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        {entry.label ?? <span className="text-muted-foreground">—</span>}
                        <button
                          type="button"
                          title="rename"
                          onClick={() => setRenaming({ id: entry.id, label: entry.label ?? "" })}
                        >
                          ✎
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{entry.ensName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{entry.chainId}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(entry.addedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex gap-1">
                      <button
                        type="button"
                        title={entry.ignored ? "track" : "ignore"}
                        disabled={disabled}
                        onClick={() => onIgnore(entry.id, !entry.ignored)}
                        className="rounded border border-border px-2 py-0.5 hover:bg-muted disabled:opacity-40"
                      >
                        {entry.ignored ? "track" : "ignore"}
                      </button>
                      {confirming === entry.id ? (
                        <button
                          type="button"
                          title="confirm remove"
                          onClick={() => {
                            onRemove(entry.id);
                            setConfirming(null);
                          }}
                          className="rounded border border-error px-2 py-0.5 text-error"
                        >
                          confirm remove?
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="remove"
                          disabled={disabled}
                          onClick={() => setConfirming(entry.id)}
                          className="rounded border border-border px-2 py-0.5 hover:bg-muted disabled:opacity-40"
                        >
                          remove
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No addresses yet - add the wallets you care about above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground">
        Chain 1 (Ethereum mainnet) for now; labels and ENS are yours, the scanner trusts neither.
        Tracked addresses appear as “{short("0x…")}” columns in Balances.
      </p>
    </div>
  );
}
