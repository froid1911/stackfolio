/**
 * Reviewing ledger events: which way an event moves a balance, and the
 * manual price pins the History page dispatches to a wallet document.
 * Pure: the caller supplies the clock and the currency.
 */

export type Direction = "in" | "out" | "neutral";

/** The holdings fold's sign table, as a badge. */
export function direction(type: string): Direction {
  if (type === "RECEIVE" || type === "STAKING") return "in";
  if (type === "SPEND") return "out";
  return "neutral";
}

/**
 * A price typed by a person, as the wallet reducer accepts it: a plain
 * non-negative decimal. A decimal comma is read as a point; anything else
 * (thousands separators, exponents, signs) is refused rather than guessed.
 */
export function parsePrice(text: string): string | null {
  const value = text.trim().replace(/^(\d+),(\d+)$/, "$1.$2");
  return /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) ? value : null;
}

/** The UTC day an event happened on, as an inclusive [from, to] window. */
export function dayWindow(timestamp: string): { from: string; to: string } {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  return { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z` };
}

interface Leg {
  documentId: string;
  eventId: string;
  sequenceIndex: number;
}

/**
 * PIN_VALUATIONS input for a manual price on some legs. A pin goes to one
 * wallet document, so only legs of `documentId` (default: the first leg's)
 * are included, each once. MANUAL wins over later automatic re-pins.
 */
export function manualPins(
  legs: Leg[],
  price: string,
  currency: string,
  now: string,
  documentId: string | undefined = legs[0]?.documentId,
) {
  const seen = new Set<string>();
  const events = [];
  for (const leg of legs) {
    const key = `${leg.eventId}\u0000${leg.sequenceIndex}`;
    if (leg.documentId !== documentId || seen.has(key)) continue;
    seen.add(key);
    events.push({
      id: leg.eventId,
      sequenceIndex: leg.sequenceIndex,
      valuation: {
        unit: currency,
        price,
        source: "MANUAL" as const,
        granularity: "NONE" as const,
        pinnedAt: now,
      },
    });
  }
  return { events };
}
