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

/** The protocol decoder's identifiers: "<tx hash>-<log index>". */
const DECODED = /^(0x[0-9a-f]{64})-\d+$/;

export interface HeldTwinRow extends HeldEventKey {
  id: string;
  type: string;
  asset: string;
  amount: string;
  ignored?: boolean;
  valuation?: unknown;
}

const legKey = (hash: string, row: { type: string; asset: string; amount: string }) =>
  `${hash}|${row.asset}|${row.amount}|${row.type === "SPEND" ? "out" : "in"}`;

/**
 * A decoded transaction's legs replace the generic Transfer rows of the
 * same transaction: same token, amount and direction. The two carry
 * different identifiers ("<hash>" against "<hash>-<log>"), so without this
 * a transaction imported generically first and decoded later is booked
 * twice. Each decoded leg claims at most one generic twin; fee rows and
 * native legs nothing decoded stay. Ignored twins stay too (they count for
 * nothing). Returns the held generic rows to remove, each with the decoded
 * row that replaces it, and the incoming rows minus generic twins.
 */
export function planSupersede<T extends HeldTwinRow>(
  held: T[],
  incoming: EventRow[],
): { remove: { row: T; by: { eventIdentifier: string; sequenceIndex: number } }[]; incoming: EventRow[] } {
  // Decoded legs, held and incoming, by their generic twin's key.
  const decoded = new Map<string, { eventIdentifier: string; sequenceIndex: number }[]>();
  for (const row of [...held, ...incoming]) {
    const match = DECODED.exec(row.eventIdentifier.toLowerCase());
    if (!match) continue;
    const key = legKey(match[1], row);
    decoded.set(key, [...(decoded.get(key) ?? []), { eventIdentifier: row.eventIdentifier, sequenceIndex: row.sequenceIndex }]);
  }
  const claim = (hash: string, row: { type: string; asset: string; amount: string }) => {
    const list = decoded.get(legKey(hash, row));
    return list && list.length > 0 ? list.shift() : undefined;
  };
  const remove: { row: T; by: { eventIdentifier: string; sequenceIndex: number } }[] = [];
  for (const row of held) {
    if (row.ignored || DECODED.test(row.eventIdentifier.toLowerCase())) continue;
    const by = claim(row.eventIdentifier.toLowerCase(), row);
    if (by) remove.push({ row, by });
  }
  // An incoming copy of a removed twin goes with it; any other generic
  // row goes only when a decoded leg is left to claim it.
  const removed = new Set(remove.map(({ row }) => `${row.eventIdentifier.toLowerCase()}|${row.sequenceIndex}`));
  const kept = incoming.filter((row) => {
    const id = row.eventIdentifier.toLowerCase();
    if (DECODED.test(id)) return true;
    if (removed.has(`${id}|${row.sequenceIndex}`)) return false;
    return !claim(id, row);
  });
  return { remove, incoming: kept };
}
