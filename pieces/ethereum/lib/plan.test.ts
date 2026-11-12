import { describe, expect, it } from "vitest";

import { planImport } from "./plan.js";
import type { EventRow } from "./types.js";

const row = (eventIdentifier: string, sequenceIndex: number): EventRow => ({
  eventIdentifier,
  sequenceIndex,
  timestamp: "2026-01-01T00:00:00.000Z",
  type: "RECEIVE",
  subtype: "NONE",
  asset: "eip155:1/slip44:60",
  amount: "1",
  counterparty: "0xabc",
  notes: null,
});

describe("planImport", () => {
  it("plans nothing when everything is held (rerun no-op)", () => {
    const incoming = [row("0xa", 0), row("0xa", 1)];
    expect(
      planImport(
        [
          { eventIdentifier: "0xa", sequenceIndex: 0 },
          { eventIdentifier: "0xa", sequenceIndex: 1 },
        ],
        incoming,
      ),
    ).toEqual([]);
  });

  it("keeps only unseen keys from an overlapping window, in order", () => {
    const planned = planImport(
      [{ eventIdentifier: "0xa", sequenceIndex: 0 }],
      [row("0xa", 0), row("0xa", 1), row("0xb", 0), row("0xa", 2)],
    );
    expect(planned.map((r) => `${r.eventIdentifier}/${r.sequenceIndex}`)).toEqual([
      "0xa/1",
      "0xb/0",
      "0xa/2",
    ]);
  });

  it("collapses repeats inside the incoming page", () => {
    const planned = planImport([], [row("0xc", 0), row("0xc", 0), row("0xc", 1)]);
    expect(planned).toHaveLength(2);
  });

  it("treats the same identifier at another index as a new event", () => {
    const planned = planImport(
      [{ eventIdentifier: "0xa", sequenceIndex: 0 }],
      [row("0xa", 1)],
    );
    expect(planned).toHaveLength(1);
  });
});
