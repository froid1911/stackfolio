import { actions, reducer, utils } from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";

const { importEvents, setEventIgnored, setEventNotes, retypeEvent } = actions;

const seeded = () =>
  reducer(
    utils.createDocument(),
    importEvents({
      batchId: "run-1",
      importedAt: "2026-11-11T00:00:00.000Z",
      events: [
        {
          id: "evt-1",
          eventIdentifier: "0xdeadbeef-1234",
          sequenceIndex: 0,
          timestamp: "2026-11-10T12:00:00.000Z",
          type: "TRANSFER" as const,
          subtype: "NONE" as const,
          asset: "eip155:1/slip44:60",
          amount: "1000000",
          counterparty: "0xspammer",
          notes: null,
        },
      ],
    }),
  );

describe("ReviewOperations", () => {
  it("should handle setEventIgnored operation", () => {
    const document = reducer(
      seeded(),
      setEventIgnored({ id: "evt-1", ignored: true }),
    );

    expect(document.state.global.ledger[0].ignored).toBe(true);
  });

  it("should handle setEventNotes operation", () => {
    let document = reducer(
      seeded(),
      setEventNotes({ id: "evt-1", notes: "spam airdrop" }),
    );
    expect(document.state.global.ledger[0].notes).toBe("spam airdrop");

    document = reducer(document, setEventNotes({ id: "evt-1", notes: null }));
    expect(document.state.global.ledger[0].notes).toBeNull();
  });

  it("should handle retypeEvent operation, keeping the source", () => {
    const document = reducer(
      seeded(),
      retypeEvent({ id: "evt-1", type: "SPEND", subtype: "SPAM" }),
    );

    const event = document.state.global.ledger[0];
    expect(event.type).toBe("SPEND");
    expect(event.subtype).toBe("SPAM");
    expect(event.source).toBe("CHAIN");
  });

  it("should reject review actions on unknown events", () => {
    for (const action of [
      setEventIgnored({ id: "nope", ignored: true }),
      setEventNotes({ id: "nope", notes: "x" }),
      retypeEvent({ id: "nope", type: "SPEND", subtype: "NONE" }),
    ]) {
      const document = reducer(utils.createDocument(), action);
      expect(document.operations.global[0].error).toBe(
        "Event nope is not in the ledger",
      );
    }
  });
});
