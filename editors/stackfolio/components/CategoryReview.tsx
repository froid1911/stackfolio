/**
 * One event's tax category: what the books use, where it came from (your
 * choice, your rule, automatic), and a select to choose it by hand. A gift
 * received asks for the giver's cost and purchase date, so the lot carries
 * them on (§23 Abs. 1 S. 3 EStG). The choice goes to the portfolio document.
 */
import { useState } from "react";
import type { EventRow } from "../lib/graphql.js";
import { CATEGORY_CHOICES, CATEGORY_LABEL, SOURCE_LABEL, overridesInput } from "../lib/categories.js";
import type { usePortfolioActions } from "../lib/mutations.js";

export type CategoryActions = Pick<
  ReturnType<typeof usePortfolioActions>,
  "ready" | "setEventCategories" | "clearEventCategories"
>;

const DECIMAL = /^(0|[1-9]\d*)(\.\d+)?$/;

export function CategoryReview({
  event,
  actions,
  currency,
  onChanged,
}: {
  event: EventRow;
  actions: CategoryActions;
  currency: string;
  onChanged: () => void;
}) {
  const current = event.category ?? "UNCLASSIFIED";
  const [category, setCategory] = useState(
    CATEGORY_LABEL[current] && current !== "UNCLASSIFIED" && current !== "SPAM" ? current : "",
  );
  const [cost, setCost] = useState("");
  const [acquiredOn, setAcquiredOn] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const key = `${event.address.toLowerCase()}|${event.eventId}|${event.sequenceIndex}`;

  const save = () => {
    if (category === "GIFT_IN" && cost.trim() !== "" && !DECIMAL.test(cost.trim())) {
      setStatus({ tone: "error", text: "Enter the giver's cost as a plain number, like 1250.50" });
      return;
    }
    actions.setEventCategories(
      overridesInput([key], category, {
        cost,
        acquiredAt: acquiredOn ? `${acquiredOn}T00:00:00.000Z` : "",
      }),
    );
    setStatus({ tone: "ok", text: "Saved. P&L updates when the books catch up." });
    onChanged();
  };

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">
        Tax category{" "}
        <span
          className={`ml-1 rounded-full border px-2 py-0.5 text-[10px] ${
            current === "UNCLASSIFIED" ? "border-warning/50 text-warning" : "border-border text-muted-foreground"
          }`}
        >
          {CATEGORY_LABEL[current] ?? current}
          {event.categorySource ? ` · ${SOURCE_LABEL[event.categorySource] ?? event.categorySource}` : ""}
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <select
          aria-label="Tax category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded border border-border bg-background px-2"
        >
          <option value="">Choose a type…</option>
          {CATEGORY_CHOICES.map(({ group, options }) => (
            <optgroup key={group} label={group}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {CATEGORY_LABEL[o]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {category === "GIFT_IN" && (
          <>
            <label className="grid gap-1">
              <span className="text-muted-foreground">Giver's cost ({currency})</span>
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                inputMode="decimal"
                className="h-9 w-32 rounded border border-border bg-background px-2"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-muted-foreground">Giver's purchase date</span>
              <input
                type="date"
                value={acquiredOn}
                onChange={(e) => setAcquiredOn(e.target.value)}
                className="h-9 rounded border border-border bg-background px-2"
              />
            </label>
          </>
        )}
        <button
          type="button"
          disabled={!actions.ready || category === ""}
          onClick={save}
          className="h-9 rounded bg-primary px-3 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Set category
        </button>
        {event.categorySource === "override" && (
          <button
            type="button"
            disabled={!actions.ready}
            onClick={() => {
              actions.clearEventCategories({
                events: [
                  {
                    wallet: event.address.toLowerCase(),
                    eventId: event.eventId,
                    sequenceIndex: event.sequenceIndex,
                  },
                ],
              });
              setStatus({ tone: "ok", text: "Back to automatic." });
              onChanged();
            }}
            className="h-9 rounded border border-border px-3 hover:bg-muted disabled:opacity-50"
          >
            Reset to automatic
          </button>
        )}
      </div>
      {category === "GIFT_IN" && (
        <p className="text-muted-foreground">
          A gift keeps the giver's cost and purchase date. Without them the units have no cost basis.
        </p>
      )}
      {status && (
        <p role="status" className={`text-xs ${status.tone === "error" ? "text-red-700" : "text-success"}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}
