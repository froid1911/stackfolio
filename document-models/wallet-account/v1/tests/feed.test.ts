import { actions, reducer, utils } from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";

const { importEvents } = actions;

interface EventInput {
  id: string;
  eventIdentifier: string;
  sequenceIndex: number;
  timestamp: string;
  type: "RECEIVE";
  subtype: "NONE";
  asset: string;
  amount: string;
  counterparty?: string;
  notes?: string | null;
}

const event = (overrides: Partial<EventInput> = {}): EventInput => ({
  id: "evt-1",
  eventIdentifier: "0xdeadbeef-1234",
  sequenceIndex: 0,
  timestamp: "2026-11-10T12:00:00.000Z",
  type: "RECEIVE",
  subtype: "NONE",
  asset: "eip155:1/slip44:60",
  amount: "1.5",
  counterparty: "0xfeedface",
  notes: null,
  ...overrides,
});

const batch = (events: EventInput[], batchId = "run-1") => ({
  batchId,
  importedAt: "2026-11-11T00:00:00.000Z",
  events,
});

describe("FeedOperations", () => {
  it("should handle importEvents operation", () => {
    const document = reducer(
      utils.createDocument(),
      importEvents(batch([event(), event({ id: "evt-2", sequenceIndex: 1 })])),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.ledger).toHaveLength(2);
    const first = document.state.global.ledger[0];
    expect(first.ignored).toBe(false);
    expect(first.source).toBe("CHAIN");
    expect(first.importBatch).toBe("run-1");
    expect(first.counterparty).toBe("0xfeedface");
  });

  it("should default counterparty and notes to null", () => {
    const { counterparty: _c, notes: _n, ...rest } = event();
    const document = reducer(
      utils.createDocument(),
      importEvents(batch([rest])),
    );

    const first = document.state.global.ledger[0];
    expect(first.counterparty).toBeNull();
    expect(first.notes).toBeNull();
  });

  it("should reject an empty batch", () => {
    const document = reducer(
      utils.createDocument(),
      importEvents(batch([])),
    );

    expect(document.operations.global[0].error).toBe(
      "An import batch must carry at least one event",
    );
  });

  it("should reject an event already in the ledger", () => {
    const document = reducer(
      reducer(utils.createDocument(), importEvents(batch([event()]))),
      importEvents(batch([event({ id: "evt-retry" })], "run-2")),
    );

    expect(document.operations.global[1].error).toBe(
      "Event 0xdeadbeef-1234#0 already imported",
    );
    // Review focus: a rejected batch leaves the ledger untouched (atomicity).
    expect(document.state.global.ledger).toHaveLength(1);
    expect(document.state.global.ledger[0].id).toBe("evt-1");
  });

  it("should reject duplicates within one batch", () => {
    const document = reducer(
      utils.createDocument(),
      importEvents(
        batch([event(), event({ id: "evt-2", sequenceIndex: 0 })]),
      ),
    );

    expect(document.operations.global[0].error).toBe(
      "Event 0xdeadbeef-1234#0 already imported",
    );
    expect(document.state.global.ledger).toHaveLength(0);
  });

  it("should reject a non-decimal amount", () => {
    const document = reducer(
      utils.createDocument(),
      importEvents(batch([event({ amount: "1,5" })])),
    );

    expect(document.operations.global[0].error).toBe(
      "1,5 is not a decimal amount",
    );
    expect(document.state.global.ledger).toHaveLength(0);
  });
});
