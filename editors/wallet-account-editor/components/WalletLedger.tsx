import { useSelectedWalletAccountDocument, actions } from "document-models/wallet-account";
import { useState } from "react";
import { fmtAmount, fmtFiat } from "../../stackfolio/lib/format.js";

const PAGE = 50;

/** Decimals by asset family: Bitcoin (native, testnet included) uses 8
 * sats-per-coin; EVM natives and tokens use 18. */
function decimalsOf(asset: string): number {
  return asset.startsWith("bip122:") ? 8 : 18;
}

/**
 * Review of one wallet's ledger: newest first, with the actions a reviewer
 * needs — ignore an event that belongs to the history but not to the book,
 * attach a note, retype what it was. Everything dispatches to this
 * document; the index and every view follow.
 */
export function WalletLedger() {
  const [document, dispatch] = useSelectedWalletAccountDocument();
  const [shown, setShown] = useState(PAGE);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<string | null>(null);
  const [priceValue, setPriceValue] = useState("");
  const [priceUnit, setPriceUnit] = useState("EUR");
  const state = document.state.global;
  const ledger = [...state.ledger].sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : b.sequenceIndex - a.sequenceIndex,
  );
  const visible = ledger.slice(0, shown);

  function run(batch: Parameters<typeof dispatch>[0]) {
    setError(null);
    dispatch(batch, (errors) => setError(errors[0]?.message));
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <section className="mb-4 grid grid-cols-2 gap-4 rounded border border-border p-4 text-sm md:grid-cols-4">
        <Field label="Address">
          <span className="font-mono">{state.address}</span>
        </Field>
        <Field label="Chain">{state.chainId}</Field>
        <Field label="Native balance">
          {state.nativeBalance
            ? `${fmtAmount(state.nativeBalance.amount, state.chainId === 0 ? 8 : 18, 5)} ${
                state.chainId === 0 ? "BTC" : "ETH"
              }`
            : "—"}
        </Field>
        <Field label="Scan progress">
          logs #{state.cursor?.lastLogsBlock ?? "—"} · native #
          {state.cursor?.lastNativeScanBlock ?? "—"} ·{" "}
          {String(state.backfill?.state ?? "IDLE").toLowerCase()}
        </Field>
      </section>
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">Time</th>
            <th>Type</th>
            <th className="text-right">Amount</th>
            <th className="text-right">Valuation</th>
            <th>Counterparty</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((event) => (
            <tr key={event.id} className={event.ignored ? "border-t border-border opacity-50" : "border-t border-border"}>
              <td className="py-2 whitespace-nowrap">
                {new Date(event.timestamp).toLocaleString()}
              </td>
              <td>
                {event.type.toLowerCase()}
                {event.subtype !== "NONE" && (
                  <span className="text-xs text-muted-foreground">
                    {"/"}
                    {event.subtype.toLowerCase()}
                  </span>
                )}
              </td>
              <td className="text-right font-mono">
                {event.type === "SPEND" ? "-" : ""}
                {fmtAmount(event.amount, decimalsOf(event.asset), 6)}{" "}
                <span className="text-xs">{event.asset}</span>
              </td>
              <td className="text-right whitespace-nowrap">
                {event.valuation ? (
                  <span className="font-mono text-xs">
                    {fmtFiat(event.valuation.price)} {event.valuation.unit}
                    {event.valuation.granularity === "DAY" && (
                      <span
                        className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                        title={`Day-rounded price, pinned ${new Date(event.valuation.pinnedAt).toLocaleString()}`}
                      >
                        day
                      </span>
                    )}
                    {event.valuation.source === "MANUAL" && (
                      <span
                        className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground"
                        title="You set this price"
                      >
                        manual
                      </span>
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => {
                      setPricing(event.id);
                      setPriceValue("");
                      setPriceUnit("EUR");
                    }}
                  >
                    set price
                  </button>
                )}
              </td>
              <td className="max-w-[200px] truncate">
                {event.counterpartyLabel ?? event.counterparty ?? "—"}
              </td>
              <td>
                <input
                  className="w-full min-w-[80px] border-b border-transparent bg-transparent text-xs focus:border-border"
                  defaultValue={event.notes ?? ""}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value !== (event.notes ?? "")) {
                      run(actions.setEventNotes({ id: event.id, notes: value }));
                    }
                  }}
                />
              </td>
              <td className="whitespace-nowrap text-right text-xs">
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    run(actions.setEventIgnored({ id: event.id, ignored: !event.ignored }))
                  }
                >
                  {event.ignored ? "restore" : "ignore"}
                </button>
                {" · "}
                <select
                  className="bg-transparent text-xs"
                  value={event.type}
                  onChange={(e) =>
                    run(
                      actions.retypeEvent({
                        id: event.id,
                        type: e.target.value as (typeof event.type),
                        subtype: event.subtype,
                      }),
                    )
                  }
                >
                  {[
                    "SPEND",
                    "RECEIVE",
                    "TRADE",
                    "TRANSFER",
                    "STAKING",
                    "MIGRATE",
                    "INFORMATIONAL",
                  ].map((type) => (
                    <option key={type} value={type}>
                      {type.toLowerCase()}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {pricing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30">
          <div className="w-80 rounded-xl border border-border bg-card p-4 text-sm">
            <p className="font-semibold">Price this event</p>
            <p className="mt-1 text-xs text-muted-foreground">
              One whole unit of the asset, in your base currency. Recorded as
              a manual valuation; the books re-fold the moment it lands.
            </p>
            <label className="mt-3 block text-xs">
              Price per unit
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 font-mono"
                placeholder="2000.00"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
              />
            </label>
            <label className="mt-2 block text-xs">
              Unit
              <input
                className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5"
                value={priceUnit}
                onChange={(e) => setPriceUnit(e.target.value)}
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-border px-3 py-1 text-xs"
                onClick={() => setPricing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                disabled={!/^\d+(\.\d+)?$/.test(priceValue)}
                onClick={() => {
                  const event = ledger.find((e) => e.id === pricing);
                  if (!event) return;
                  run(
                    actions.pinValuations({
                      events: [
                        {
                          id: event.id,
                          sequenceIndex: event.sequenceIndex,
                          valuation: {
                            unit: priceUnit || "EUR",
                            price: priceValue,
                            source: "MANUAL",
                            granularity: "NONE",
                            pinnedAt: new Date().toISOString(),
                          },
                        },
                      ],
                    }),
                  );
                  setPricing(null);
                }}
              >
                Pin valuation
              </button>
            </div>
          </div>
        </div>
      )}
      {shown < ledger.length && (
        <button
          type="button"
          className="mt-3 text-sm underline"
          onClick={() => setShown((s) => s + PAGE)}
        >
          show {Math.min(PAGE, ledger.length - shown)} of {ledger.length} events
        </button>
      )}
      {ledger.length === 0 && (
        <p className="py-6 text-center text-muted-foreground">
          Nothing imported yet — the reconciler fills this ledger as its
          scheduled runs land.
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}
