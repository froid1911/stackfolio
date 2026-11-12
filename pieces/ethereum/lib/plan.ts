import type { EventRow } from "./types.js";

export interface HeldEventKey {
  eventIdentifier: string;
  sequenceIndex: number;
}

function key(row: HeldEventKey): string {
  return `${row.eventIdentifier}|${row.sequenceIndex}`;
}

/**
 * Which incoming rows are genuinely new for a document that already holds
 * `held`? Filter only: nothing is mutated, nothing is reordered, and rows
 * repeated within the incoming page collapse to their first occurrence. A
 * rerun of the same window therefore plans to nothing, and overlapping
 * windows contribute only their unseen remainder.
 */
export function planImport(
  held: HeldEventKey[],
  incoming: EventRow[],
): EventRow[] {
  const seen = new Set(held.map(key));
  const planned: EventRow[] = [];
  for (const row of incoming) {
    const k = key(row);
    if (seen.has(k)) continue;
    seen.add(k);
    planned.push(row);
  }
  return planned;
}
