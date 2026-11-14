/**
 * "N transactions unclassified": the books leave them out until each has a
 * tax category, so the totals below are incomplete. Links to the queue.
 */
import type { Queue, QueryState } from "../lib/graphql.js";
import { fmtFiat } from "../lib/format.js";

export function UnclassifiedNotice({
  queue,
  onOpen,
}: {
  queue: QueryState<Queue>;
  onOpen: () => void;
}) {
  const total = queue.data?.total ?? 0;
  if (total === 0) return null;
  const value = queue.data?.value;
  return (
    <div className="mx-6 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-xs">
      <span>
        {total} transaction{total === 1 ? "" : "s"} unclassified
        {value ? ` (€${fmtFiat(value)})` : ""} — not in the books yet.
      </span>
      <button type="button" onClick={onOpen} className="font-medium text-primary underline-offset-2 hover:underline">
        Review →
      </button>
    </div>
  );
}
