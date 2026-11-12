/**
 * The event detail overlay: one ledger event in full, addressed by id
 * through ?detail=event:<slug> (lib/detail). The row reads exclusively
 * from the ledger index - the wallet that produced it may be long gone
 * from the drive, the event still renders (stale-detail rule: required
 * fields never come from live account rows).
 */
import { useAddressLabels, useAssets, useEventsPage, useRealizedEvents } from "../lib/graphql.js";
import { fmtAmount } from "../lib/format.js";

export function EventDetail({
  driveId,
  eventId,
  onClose,
  onOpenAccount,
  onOpenHistory,
  onOpenPnl,
}: {
  driveId: string;
  /** The live event id (resolved from the slug by the caller). */
  eventId: string;
  onClose: () => void;
  onOpenAccount: (address: string) => void;
  onOpenHistory: (ids: string[]) => void;
  onOpenPnl: () => void;
}) {
  const page = useEventsPage(driveId, { ids: [eventId], first: 1 });
  const assets = useAssets(driveId);
  const labels = useAddressLabels(driveId);
  const realized = useRealizedEvents(driveId, {});

  const event = page.data?.rows.find((r) => r.eventId === eventId);
  const asset = (assets.data ?? []).find((a) => a.identifier === event?.asset);
  const labelOf = new Map((labels.data ?? []).map((l) => [l.address, l]));

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold">
          {event ? `${event.type.toLowerCase()} · ${new Date(event.timestamp).toLocaleString()}` : "Event"}
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
        >
          ✕
        </button>
      </div>

      {!event ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {page.loading ? "Loading the event…" : `No such event (${eventId}).`}
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Identifier</dt>
            <dd className="font-mono">{event.eventIdentifier}</dd>
            <dt className="text-muted-foreground">Kind</dt>
            <dd>
              {event.type}
              {event.subtype !== "NONE" ? ` · ${event.subtype}` : ""}
              {event.source === "MANUAL" ? " · manual" : ""}
            </dd>
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="tabular-nums">
              {fmtAmount(event.amount, asset?.decimals ?? 18, 8)}{" "}
              {asset?.symbol ?? event.asset}
            </dd>
            <dt className="text-muted-foreground">Counterparty</dt>
            <dd>
              {event.counterpartyLabel
                ?? (event.counterparty
                  ? `${event.counterpartyLabel ?? ""}${labelOf.get(event.counterparty)?.label ?? event.counterparty}`
                  : "—")}
            </dd>
            <dt className="text-muted-foreground">Account</dt>
            <dd>
              <button
                type="button"
                className="text-accent underline-offset-2 hover:underline"
                onClick={() => onOpenAccount(event.address)}
              >
                {event.label ?? labelOf.get(event.address)?.label ?? event.address}
              </button>
            </dd>
            <dt className="text-muted-foreground">Chain</dt>
            <dd>{event.chainId}</dd>
            <dt className="text-muted-foreground">Notes</dt>
            <dd>{event.notes ?? "—"}</dd>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <button
              type="button"
              onClick={() => onOpenHistory([event.eventId])}
              className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted"
            >
              Show in history
            </button>
            {(realized.data ?? []).some((r) => r.sourceEventId === event.eventId) && (
              <button
                type="button"
                onClick={onOpenPnl}
                className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted"
              >
                P&amp;L context
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
