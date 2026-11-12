import {
  importEvents,
  reducer,
  replaceEvents,
  setEventIgnored,
  setEventNotes,
  utils,
} from "document-models/wallet-account/v1";
import { retypeEvent } from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";

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

/** A ledger holding the single default event. */
const imported = () =>
  reducer(utils.createDocument(), importEvents(batch([event()])));

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
    const document = reducer(utils.createDocument(), importEvents(batch([])));

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
      importEvents(batch([event(), event({ id: "evt-2", sequenceIndex: 0 })])),
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

  it("should accept the protocol subtypes and map import valuations", () => {
    const document = reducer(
      utils.createDocument(),
      importEvents({
        batchId: "run-2",
        importedAt: "2026-11-11T00:00:00.000Z",
        events: [
          {
            id: "evt-b",
            eventIdentifier: "0xabc-1",
            sequenceIndex: 0,
            timestamp: "2026-11-10T12:00:00.000Z",
            type: "RECEIVE",
            subtype: "BORROW",
            asset: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            amount: "1000",
            valuation: {
              unit: "EUR",
              price: "0.9",
              source: "COINGECKO",
              granularity: "DAY",
              pinnedAt: "2026-11-12T00:00:00.000Z",
            },
          },
        ],
      }),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    const row = document.state.global.ledger[0];
    expect(row.subtype).toBe("BORROW");
    expect(row.valuation?.price).toBe("0.9");
  });

  it("should replace rows and add semantic ones in one operation", () => {
    const document = reducer(
      imported(),
      replaceEvents({
        batchId: "re-1",
        remove: [{ id: "evt-1", sequenceIndex: 0 }],
        add: [
          {
            id: "evt-1",
            eventIdentifier: "0xdeadbeef-1234",
            sequenceIndex: 1,
            timestamp: "2026-11-10T12:00:00.000Z",
            type: "SPEND",
            subtype: "DEPOSIT_ASSET",
            asset: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            amount: "1000",
          },
        ],
      }),
    );

    const operation = document.operations.global[1];
    expect(operation.error).toBeUndefined();
    expect(document.state.global.ledger).toHaveLength(1);
    const row = document.state.global.ledger[0];
    expect(row.subtype).toBe("DEPOSIT_ASSET");
    expect(row.importBatch).toBe("re-1");
  });

  it("should carry review overrides onto the replacement row", () => {
    let document = reducer(
      imported(),
      setEventIgnored({ id: "evt-1", ignored: true }),
    );
    document = reducer(document, setEventNotes({ id: "evt-1", notes: "reviewed" }));
    document = reducer(
      document,
      replaceEvents({
        batchId: "re-1",
        remove: [{ id: "evt-1", sequenceIndex: 0 }],
        add: [{ ...event(), notes: "from chain" }],
      }),
    );

    const row = document.state.global.ledger[0];
    expect(row.ignored).toBe(true);
    expect(row.notes).toBe("reviewed");
  });

  it("should drop a retyped row in favor of the decoded semantics", () => {
    let document = reducer(
      imported(),
      retypeEvent({ id: "evt-1", type: "INFORMATIONAL", subtype: "SPAM" }),
    );
    document = reducer(
      document,
      replaceEvents({
        batchId: "re-1",
        remove: [{ id: "evt-1", sequenceIndex: 0 }],
        add: [{ ...event(), subtype: "DEPOSIT_ASSET" }],
      }),
    );
    expect(document.state.global.ledger[0].subtype).toBe("DEPOSIT_ASSET");
  });

  it("should skip additions that collide with a surviving row", () => {
    const two = reducer(
      utils.createDocument(),
      importEvents(
        batch([
          event(),
          event({ id: "evt-2", eventIdentifier: "0xdeadbeef-5678" }),
        ]),
      ),
    );
    const document = reducer(
      two,
      replaceEvents({
        batchId: "re-1",
        remove: [{ id: "evt-1", sequenceIndex: 0 }],
        add: [
          {
            id: "evt-1",
            eventIdentifier: "0xdeadbeef-5678",
            sequenceIndex: 0,
            timestamp: "2026-11-10T12:00:00.000Z",
            type: "SPEND",
            subtype: "DEPOSIT_ASSET",
            asset: "eip155:1/slip44:60",
            amount: "2",
          },
        ],
      }),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.ledger).toHaveLength(1);
    expect(document.state.global.ledger[0].id).toBe("evt-2");
  });

  it("should reject an empty replacement", () => {
    const document = reducer(
      imported(),
      replaceEvents({ batchId: "re-1", remove: [], add: [] }),
    );
    expect(document.operations.global[1].error).toBeDefined();
  });

  it("should reject a non-decimal amount in the additions", () => {
    const document = reducer(
      imported(),
      replaceEvents({
        batchId: "re-1",
        remove: [{ id: "evt-1", sequenceIndex: 0 }],
        add: [{ ...event(), amount: "1,5" }],
      }),
    );
    expect(document.operations.global[1].error).toBeDefined();
    expect(document.state.global.ledger).toHaveLength(1);
    expect(document.state.global.ledger[0].id).toBe("evt-1");
  });
});
