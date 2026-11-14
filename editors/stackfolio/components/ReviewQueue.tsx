/**
 * "Needs a type": the transactions the books leave out until someone says
 * what they were, grouped by counterparty and direction, most EUR first.
 * One choice per group becomes a rule ("always for this address") or a
 * hand-picked category for just these legs; a suspected airdrop (a token
 * pushed to a wallet that never held it) can be thrown out as spam. The books re-fold on their own afterwards.
 */
import { useState } from "react";
import type { Queue, QueueGroup, QueryState } from "../lib/graphql.js";
import { fmtFiat } from "../lib/format.js";
import {
  CATEGORY_CHOICES,
  CATEGORY_LABEL,
  isAddress,
  overridesInput,
  ruleInput,
} from "../lib/categories.js";
import type { usePortfolioActions } from "../lib/mutations.js";
import { short } from "./Dashboard.js";

export type QueueActions = Pick<
  ReturnType<typeof usePortfolioActions>,
  "ready" | "setEventCategories" | "addCategoryRule" | "setAssetIgnored"
>;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function CategorySelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
  );
}

function GroupRow({
  group,
  symbolOf,
  actions,
  onOpenEvents,
  onSaved,
}: {
  group: QueueGroup;
  symbolOf: (asset: string) => string;
  actions: QueueActions;
  onOpenEvents: (keys: string[]) => void;
  onSaved: () => void;
}) {
  // The airdrop flag is a hint, never a default: a first receipt of a real
  // token (a withdrawal from an exchange) looks the same on chain.
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState(group.counterpartyLabel ?? "");
  const ruleable = isAddress(group.counterparty);
  const everyLeg = group.events.length >= group.count;
  const who =
    group.counterpartyLabel ??
    (group.counterparty ? (ruleable ? short(group.counterparty) : group.counterparty) : "No counterparty");
  const shown = group.assets.slice(0, 4).map(symbolOf).join(", ");
  const more = group.assets.length > 4 ? ` +${group.assets.length - 4}` : "";
  const disabled = !actions.ready || category === "";

  return (
    <li className="grid gap-2 rounded-lg border border-border p-3" data-group={`${group.counterparty ?? ""}|${group.direction}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium" title={group.counterparty ?? undefined}>
          {group.direction === "IN" ? "← from" : "→ to"} {who}
        </span>
        <span className="text-muted-foreground">
          {group.count} transaction{group.count === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">{group.value === null ? "unpriced" : `€${fmtFiat(group.value)}`}</span>
        <span className="text-muted-foreground">
          {shown}
          {more}
        </span>
        {group.suspectedAirdrop && (
          <span className="rounded-full border border-warning/50 px-2 py-0.5 text-[10px] text-warning">
            suspected airdrop
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CategorySelect value={category} onChange={setCategory} label={`Type for ${who}`} />
        {ruleable && (
          <input
            className="w-36 rounded-lg border border-border bg-background px-2 py-1 text-xs"
            placeholder="Label (optional)"
            aria-label={`Label for ${who}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}
        <button
          type="button"
          disabled={disabled || !ruleable}
          title={ruleable ? undefined : "Rules need an address; use 'Only these'"}
          onClick={() => {
            actions.addCategoryRule(
              ruleInput(newId(), group.counterparty as string, group.direction, category, label),
            );
            onSaved();
          }}
          className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          Always for this address
        </button>
        <button
          type="button"
          disabled={disabled || !everyLeg}
          title={everyLeg ? undefined : "Too many for one-off choices; use a rule"}
          onClick={() => {
            actions.setEventCategories(overridesInput(group.events, category));
            onSaved();
          }}
          className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-40"
        >
          Only these {group.count}
        </button>
        {group.suspectedAirdrop && (
          <button
            type="button"
            disabled={!actions.ready}
            onClick={() => {
              actions.setAssetIgnored(group.assets, true);
              onSaved();
            }}
            className="rounded-lg border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            Spam
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpenEvents(group.events)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Show
        </button>
      </div>
    </li>
  );
}

export function ReviewQueue({
  queue,
  symbolOf,
  actions,
  onOpenEvents,
  onChanged,
}: {
  queue: QueryState<Queue>;
  symbolOf: (asset: string) => string;
  actions: QueueActions;
  onOpenEvents: (keys: string[]) => void;
  onChanged: () => void;
}) {
  const [saved, setSaved] = useState(false);
  if (queue.error) return <p className="mt-4 text-xs text-red-700">{queue.error}</p>;
  if (!queue.data) return <p className="mt-4 text-xs text-muted-foreground">Loading…</p>;
  const { groups, total, value } = queue.data;
  if (total === 0) {
    return <p className="mt-4 text-xs text-muted-foreground">Every transaction has a type.</p>;
  }
  return (
    <section aria-label="Needs a type" className="mt-4 grid gap-3 text-xs">
      <p className="text-muted-foreground">
        {total} transaction{total === 1 ? "" : "s"}
        {value === null ? "" : ` (€${fmtFiat(value)})`} are left out of the books until they have a type.
        A rule covers every transaction with that address, now and later.
      </p>
      {saved && (
        <p role="status" className="text-success">
          Saved — the queue updates when the books catch up.
        </p>
      )}
      <ul className="grid gap-2">
        {groups.map((group) => (
          <GroupRow
            key={`${group.counterparty ?? ""}|${group.direction}`}
            group={group}
            symbolOf={symbolOf}
            actions={actions}
            onOpenEvents={onOpenEvents}
            onSaved={() => {
              setSaved(true);
              onChanged();
            }}
          />
        ))}
      </ul>
    </section>
  );
}
