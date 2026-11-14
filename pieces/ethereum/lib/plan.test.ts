import { describe, expect, it } from "vitest";

import { planImport, planSupersede } from "./plan.js";
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

describe("planSupersede", () => {
  const TX = `0x${"a".repeat(64)}`;
  const USDT = "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7";
  const held = (
    id: string,
    eventIdentifier: string,
    sequenceIndex: number,
    over: Partial<{ type: string; asset: string; amount: string; ignored: boolean; valuation: unknown }> = {},
  ) => ({ id, eventIdentifier, sequenceIndex, type: "RECEIVE", asset: USDT, amount: "15000000000", ...over });
  const incoming = (eventIdentifier: string, sequenceIndex: number, over: Partial<EventRow> = {}): EventRow => ({
    ...row(eventIdentifier, sequenceIndex),
    asset: USDT,
    amount: "15000000000",
    ...over,
  });

  it("removes the generic twin of a held decoded leg, and only that", () => {
    const ledger = [
      held("g", TX, 163), // the Transfer the generic scan booked
      held("d", `${TX}-165`, 165, { type: "RECEIVE" }), // Aave's Borrow, decoded
      held("fee", TX, 2, { type: "SPEND", asset: "eip155:1/slip44:60", amount: "21000" }),
    ];
    const plan = planSupersede(ledger, []);
    expect(plan.remove.map((r) => [r.row.id, r.by.eventIdentifier])).toEqual([["g", `${TX}-165`]]);
  });

  it("matches token, amount and direction, one twin per decoded leg", () => {
    const ledger = [
      held("in1", TX, 1),
      held("in2", TX, 2),
      held("out", TX, 3, { type: "SPEND" }),
      held("other", TX, 4, { amount: "1" }),
      held("d", `${TX}-9`, 9),
    ];
    expect(planSupersede(ledger, []).remove.map((r) => r.row.id)).toEqual(["in1"]);
  });

  it("keeps an ignored twin: it counts for nothing already", () => {
    const ledger = [held("g", TX, 1, { ignored: true }), held("d", `${TX}-2`, 2)];
    expect(planSupersede(ledger, []).remove).toEqual([]);
  });

  it("drops an incoming generic twin, and supersedes held twins of incoming decoded legs", () => {
    const plan = planSupersede([held("g", TX.toUpperCase().replace("0X", "0x"), 1)], [incoming(`${TX}-5`, 5), incoming(TX, 1)]);
    expect(plan.remove.map((r) => r.row.id)).toEqual(["g"]);
    expect(plan.incoming.map((r) => r.eventIdentifier)).toEqual([`${TX}-5`]);

    const generic = planSupersede([held("d", `${TX}-5`, 5)], [incoming(TX, 1), incoming(TX, 2, { amount: "7" })]);
    expect(generic.incoming.map((r) => [r.eventIdentifier, r.sequenceIndex])).toEqual([[TX, 2]]);
  });

  it("leaves a ledger without decoded rows alone", () => {
    const plan = planSupersede([held("g", TX, 1)], [incoming(TX, 2)]);
    expect(plan.remove).toEqual([]);
    expect(plan.incoming).toHaveLength(1);
  });
});
