/**
 * Ctrl+K palette: one input over every searchable thing - pages,
 * accounts, assets, recent events. Pure hit building lives in
 * lib/search.ts; this is the keyboard list and the navigation intent.
 * No radix: the listbox contract is small enough to own (roles and
 * arrows per WAI-ARIA), and the drive app must not grow UI deps.
 */
import { useCallback, useMemo, useState } from "react";
import { buildHits, type SearchHit } from "../lib/search.js";
import { useAddressLabels, useAssets, useEventsPage } from "../lib/graphql.js";
import { slug } from "../lib/slugs.js";

const MAX_HITS = 24;

export function CommandPalette({
  open,
  onClose,
  driveId,
  onGo,
}: {
  open: boolean;
  onClose: () => void;
  driveId: string;
  onGo: (hit: SearchHit) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // Accounts for the palette are the address book's entries (every
  // labelled/ENS address), not just the chain-tracked wallets.
  const labels = useAddressLabels(driveId);
  const assets = useAssets(driveId);
  // Events search rides the index's own query filter (identifier, type,
  // asset, notes); the palette takes the newest matches of the term.
  const events = useEventsPage(driveId, {
    query: query.trim() || undefined,
    first: 8,
    ignored: false,
  });

  const hits = useMemo<SearchHit[]>(
    () =>
      buildHits(query, {
        accounts: (labels.data ?? []).map((a) => ({
          address: a.address,
          ensName: a.ensName,
          label: a.label,
        })),
        assets: (assets.data ?? []).map((a) => ({
          identifier: a.identifier,
          symbol: a.symbol,
          name: a.name,
        })),
        events: (events.data?.rows ?? []).map((e) => ({
          eventId: e.eventId,
          eventIdentifier: e.eventIdentifier,
          timestamp: e.timestamp,
          type: e.type,
          asset: e.asset,
          amount: e.amount,
        })),
      }).slice(0, MAX_HITS),
    [query, labels.data, assets.data, events.data],
  );

  // A fresh palette on every open: reset while rendering, not in an effect
  // (an effect's setState renders twice). The input mounts on open, so
  // focusing it is the ref callback's job.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActive(0);
    }
  }
  const focusOnMount = useCallback((input: HTMLInputElement | null) => input?.focus(), []);

  if (!open) return null;

  const invoke = (hit: SearchHit | undefined) => {
    if (!hit) return;
    onGo(hit);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-xl">
        <input
          ref={focusOnMount}
          role="combobox"
          aria-expanded
          aria-controls="stackfolio-palette-list"
          aria-label="Search stackfolio"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
          placeholder="Search pages, accounts, assets, events…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (hits.length === 0 ? 0 : (a + 1) % hits.length));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (hits.length === 0 ? 0 : (a - 1 + hits.length) % hits.length));
            } else if (e.key === "Enter") {
              e.preventDefault();
              invoke(hits[active]);
            }
          }}
        />
        <ul id="stackfolio-palette-list" role="listbox" className="max-h-80 overflow-y-auto py-1">
          {hits.map((hit, i) => (
            <li
              key={`${hit.kind}/${hit.to.page}/${hit.to.detail ?? ""}/${hit.label}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => invoke(hit)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2 text-sm ${
                i === active ? "bg-accent text-accent-foreground" : ""
              }`}
            >
              <span className="truncate">{hit.label}</span>
              <span className="flex shrink-0 items-baseline gap-2 text-[10px] text-muted-foreground">
                {hit.sub && <span className="truncate">{hit.sub}</span>}
                <span className="uppercase">{hit.kind}</span>
              </span>
            </li>
          ))}
          {hits.length === 0 && query.trim() !== "" && !labels.loading && (
            <li className="px-4 py-3 text-sm text-muted-foreground">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

/** Ctrl/Cmd+K opens, Escape closes; a modal-safe listener. Returns the
 * key handler the app root attaches to `window` (a real keydown, so
 * jsdom tests can dispatch it). */
export function paletteKeyHandler(open: boolean, onOpen: () => void, onClose: () => void) {
  return (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (open) onClose();
      else onOpen();
    } else if (event.key === "Escape" && open) {
      onClose();
    }
  };
}

