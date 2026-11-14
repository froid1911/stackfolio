/**
 * Fix one ledger event in place: price it (one leg, or every unpriced leg
 * of the asset that day in the same wallet), keep it out of the books,
 * note it, or correct its type. Each action goes to the wallet document
 * that owns the event; a rejection is shown next to the control.
 */
import { useState } from "react";
import { useDocumentById } from "@powerhousedao/reactor-browser";
import { actions as walletActions } from "document-models/wallet-account";
import type { EventSubtype, EventType } from "document-models/wallet-account";
import { useEventsPage, type EventRow } from "../lib/graphql.js";
import { dayWindow, manualPins, parsePrice } from "../lib/review.js";

const TYPES: EventType[] = ["RECEIVE", "SPEND", "STAKING", "TRADE", "TRANSFER", "MIGRATE", "INFORMATIONAL"];
const SUBTYPES: EventSubtype[] = [
  "NONE", "AIRDROP", "BORROW", "REPAY", "DEPOSIT_ASSET", "WITHDRAWAL", "REMOVE_ASSET",
  "BRIDGE", "FEE", "YIELD", "BLOCK_PRODUCTION", "LIQUIDATION", "LP_MINT", "LP_BURN",
  "DONATE", "APPROVE", "NAME_REGISTRATION", "SPAM",
];

type Status = { tone: "ok" | "error"; text: string } | null;

function Note({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p role="status" className={`text-xs ${status.tone === "error" ? "text-red-700" : "text-success"}`}>
      {status.text}
    </p>
  );
}

export function EventReview({
  driveId,
  event,
  symbol,
  currency,
  onChanged,
}: {
  driveId: string;
  event: EventRow;
  symbol: string;
  currency: string;
  /** Refetch the views once an action is accepted. */
  onChanged: () => void;
}) {
  const [, dispatch] = useDocumentById(event.documentId);
  const day = dayWindow(event.timestamp);
  const sameDay = useEventsPage(driveId, {
    needsPrice: true,
    asset: event.asset,
    address: event.address,
    from: day.from,
    to: day.to,
    first: 500,
  });
  const sameDayLegs = (sameDay.data?.rows ?? []).filter((r) => r.documentId === event.documentId);

  const [price, setPrice] = useState("");
  const [scope, setScope] = useState<"event" | "day">("event");
  const [priceStatus, setPriceStatus] = useState<Status>(null);
  const [notes, setNotes] = useState(event.notes ?? "");
  const [notesStatus, setNotesStatus] = useState<Status>(null);
  const [type, setType] = useState(event.type as EventType);
  const [subtype, setSubtype] = useState(event.subtype as EventSubtype);
  const [kindStatus, setKindStatus] = useState<Status>(null);
  const [ignoreStatus, setIgnoreStatus] = useState<Status>(null);

  /** Dispatch one action; report acceptance or the reducer's reason. */
  const send = (
    action: Parameters<typeof dispatch>[0],
    report: (s: Status) => void,
    done: string,
  ) => {
    report(null);
    dispatch(
      action,
      (errors: Error[]) => {
        if (errors[0]) report({ tone: "error", text: errors[0].message });
      },
      // onSuccess runs even after a rejection; only an all-applied outcome is "done".
      (_document, outcome) => {
        if (outcome.rejected.length > 0) return;
        report({ tone: "ok", text: done });
        onChanged();
      },
    );
  };

  const savePrice = () => {
    const parsed = parsePrice(price);
    if (parsed === null) {
      setPriceStatus({ tone: "error", text: "Enter a plain price, like 2500.50" });
      return;
    }
    const legs = scope === "event" ? [event] : sameDayLegs.length > 0 ? sameDayLegs : [event];
    const pins = manualPins(legs, parsed, currency, new Date().toISOString(), event.documentId);
    send(
      walletActions.pinValuations(pins),
      setPriceStatus,
      `Priced ${pins.events.length} leg${pins.events.length === 1 ? "" : "s"} at ${parsed} ${currency}. P&L updates when the books catch up.`,
    );
  };

  const priced = event.price !== null;
  return (
    <section aria-label="Review this event" className="mt-4 grid gap-4 border-t border-border pt-4 text-xs">
      <div className="grid gap-2">
        <p className="text-sm font-medium">
          Price{" "}
          <span className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] ${priced ? "border-success/40 text-success" : "border-warning/50 text-warning"}`}>
            {priced
              ? `${event.price} ${event.priceUnit ?? ""} · ${event.priceSource?.toLowerCase() ?? ""}`
              : event.priceGap === "value"
                ? "P&L needs a price"
                : "no price · not needed by P&L"}
          </span>
        </p>
        {event.priceGap === "basis" && (
          <p className="text-warning">
            P&amp;L found no cost basis for this disposal: an earlier {symbol} acquisition
            has no price, or came in by a transfer it could not pair. Price those to fix it.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-muted-foreground">
              {currency} per 1 {symbol}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 62255.00"
              className="h-9 w-40 rounded border border-border bg-background px-2"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Apply to</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as "event" | "day")}
              className="h-9 rounded border border-border bg-background px-2"
            >
              <option value="event">This leg only</option>
              <option value="day">
                Every unpriced {symbol} leg that day ({sameDayLegs.length})
              </option>
            </select>
          </label>
          <button
            type="button"
            onClick={savePrice}
            className="h-9 rounded bg-primary px-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Save price
          </button>
        </div>
        <p className="text-muted-foreground">
          A manual price wins over later automatic prices, and flows into balances and P&amp;L.
        </p>
        <Note status={priceStatus} />
      </div>

      {/* What the decoder saw; the tax category above is what the books use. */}
      <details className="grid gap-2">
        <summary className="cursor-pointer text-sm font-medium">Kind (raw type)</summary>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-muted-foreground">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as EventType)} className="h-9 rounded border border-border bg-background px-2">
              {TYPES.map((t) => <option key={t} value={t}>{t.toLowerCase()}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Subtype</span>
            <select value={subtype} onChange={(e) => setSubtype(e.target.value as EventSubtype)} className="h-9 rounded border border-border bg-background px-2">
              {SUBTYPES.map((t) => <option key={t} value={t}>{t.toLowerCase().replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <button
            type="button"
            disabled={type === event.type && subtype === event.subtype}
            onClick={() => send(walletActions.retypeEvent({ id: event.eventId, type, subtype }), setKindStatus, "Kind updated.")}
            className="h-9 rounded border border-border px-3 hover:bg-muted disabled:opacity-50"
          >
            Change kind
          </button>
        </div>
        <Note status={kindStatus} />
      </details>

      <div className="grid gap-2">
        <label className="grid gap-1">
          <span className="text-sm font-medium">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded border border-border bg-background px-2 py-1"
          />
        </label>
        <div>
          <button
            type="button"
            disabled={notes === (event.notes ?? "")}
            onClick={() =>
              send(walletActions.setEventNotes({ id: event.eventId, notes: notes.trim() || null }), setNotesStatus, "Notes saved.")
            }
            className="h-9 rounded border border-border px-3 hover:bg-muted disabled:opacity-50"
          >
            Save notes
          </button>
        </div>
        <Note status={notesStatus} />
      </div>

      <div className="grid gap-2">
        <div>
          <button
            type="button"
            onClick={() =>
              send(
                walletActions.setEventIgnored({ id: event.eventId, ignored: !event.ignored }),
                setIgnoreStatus,
                event.ignored ? "Counted again." : "Ignored: out of balances and the books, still listed.",
              )
            }
            className="h-9 rounded border border-border px-3 hover:bg-muted"
          >
            {event.ignored ? "Count this event again" : "Ignore in balances and accounting"}
          </button>
        </div>
        <Note status={ignoreStatus} />
      </div>
    </section>
  );
}
