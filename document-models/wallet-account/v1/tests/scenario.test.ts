import { actions, reducer, utils } from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";

const {
  setAccountDetails,
  importEvents,
  setEventIgnored,
  setEventNotes,
  retypeEvent,
  recordScanProgress,
  setBackfillState,
  setNativeBalance,
} = actions;

/** The piece's import run and a human review pass over one account. */
describe("wallet-account scenario", () => {
  it("imports a backfill, reviews it and advances state", () => {
    let document = reducer(
      utils.createDocument(),
      setAccountDetails({
        address: "0x1F9840a85d5Af5bf1D1762F925BDADdC4201F984",
        chainId: 1,
        label: "frankp.eth",
      }),
    );

    // Backfill starts in the LOGS phase.
    document = reducer(
      document,
      setBackfillState({ state: "LOGS", startBlock: 18000000, nextBlock: 18000000 }),
    );

    // One decoded batch: a deposit, an outgoing spend and a spam airdrop.
    document = reducer(
      document,
      importEvents({
        batchId: "backfill-1",
        importedAt: "2026-11-11T00:10:00.000Z",
        events: [
          {
            id: "evt-deposit",
            eventIdentifier: "0xaa11",
            sequenceIndex: 0,
            timestamp: "2026-11-01T10:00:00.000Z",
            type: "TRANSFER",
            subtype: "DEPOSIT_ASSET",
            asset: "eip155:1/slip44:60",
            amount: "5",
            counterparty: "0xc0ffee",
            notes: null,
          },
          {
            id: "evt-spend",
            eventIdentifier: "0xbb22",
            sequenceIndex: 0,
            timestamp: "2026-11-02T11:00:00.000Z",
            type: "SPEND",
            subtype: "NONE",
            asset: "eip155:1/slip44:60",
            amount: "0.25",
            counterparty: "0xdead",
            notes: null,
          },
          {
            id: "evt-spam",
            eventIdentifier: "0xcc33",
            sequenceIndex: 0,
            timestamp: "2026-11-03T12:00:00.000Z",
            type: "RECEIVE",
            subtype: "NONE",
            asset: "eip155:1/erc20:0x1337",
            amount: "1000000",
            counterparty: "0xspammer",
            notes: null,
          },
        ],
      }),
    );

    // A rerun of the same batch is refused without touching the ledger.
    document = reducer(
      document,
      importEvents({
        batchId: "backfill-1-retry",
        importedAt: "2026-11-11T00:11:00.000Z",
        events: [
          {
            id: "evt-retry",
            eventIdentifier: "0xaa11",
            sequenceIndex: 0,
            timestamp: "2026-11-01T10:00:00.000Z",
            type: "TRANSFER",
            subtype: "DEPOSIT_ASSET",
            asset: "eip155:1/slip44:60",
            amount: "5",
            counterparty: "0xc0ffee",
            notes: null,
          },
        ],
      }),
    );
    expect(document.operations.global[3].error).toBe(
      "Event 0xaa11#0 already imported",
    );

    // The human review marks the airdrop spam and annotates it.
    document = reducer(
      document,
      retypeEvent({ id: "evt-spam", type: "INFORMATIONAL", subtype: "SPAM" }),
    );
    document = reducer(
      document,
      setEventNotes({ id: "evt-spam", notes: "spam airdrop campaign" }),
    );
    document = reducer(
      document,
      setEventIgnored({ id: "evt-spam", ignored: true }),
    );

    // The run records progress, then the backfill walks to DONE.
    document = reducer(
      document,
      recordScanProgress({
        lastLogsBlock: 18000500,
        lastEventTimestamp: "2026-11-03T12:00:00.000Z",
        ranAt: "2026-11-11T00:12:00.000Z",
      }),
    );
    document = reducer(
      document,
      setBackfillState({ state: "NATIVE", startBlock: 18000000, nextBlock: 18000500 }),
    );
    document = reducer(
      document,
      setNativeBalance({
        amount: "4.25",
        blockNumber: 18000500,
        observedAt: "2026-11-11T00:13:00.000Z",
      }),
    );
    document = reducer(
      document,
      recordScanProgress({
        lastNativeScanBlock: 18000500,
        ranAt: "2026-11-11T00:14:00.000Z",
      }),
    );
    document = reducer(
      document,
      setBackfillState({ state: "DONE", startBlock: 18000000, nextBlock: 18000500 }),
    );

    expect(document.operations.global).toHaveLength(12);
    const state = document.state.global;
    expect(state.ledger).toHaveLength(3);
    expect(state.ledger[2].subtype).toBe("SPAM");
    expect(state.ledger[2].ignored).toBe(true);
    expect(state.ledger[2].importBatch).toBe("backfill-1");
    expect(state.cursor).toEqual({
      lastLogsBlock: 18000500,
      lastNativeScanBlock: 18000500,
      lastEventTimestamp: "2026-11-03T12:00:00.000Z",
      lastRunAt: "2026-11-11T00:14:00.000Z",
    });
    expect(state.backfill?.state).toBe("DONE");
    expect(state.nativeBalance?.amount).toBe("4.25");
  });
});
