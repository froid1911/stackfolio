import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumImportEventsToWalletAccountAction } from "./import-events-to-wallet-account.js";

const get = vi.fn();
const execute = vi.fn();

const walletDoc = (ledger: unknown[]) => ({
  header: { documentId: "w1", documentType: "stackfolio/wallet-account" },
  state: { global: { address: "0x1234", chainId: 1, ignored: false, ledger } },
});

const event = (eventIdentifier: string, sequenceIndex: number) => ({
  eventIdentifier,
  sequenceIndex,
  timestamp: "2026-01-01T00:00:00.000Z",
  type: "RECEIVE",
  subtype: "NONE",
  asset: "eip155:1/slip44:60",
  amount: "1000000000000000000",
  counterparty: "0xabc",
  notes: null,
});

const run = (props: Record<string, unknown>) =>
  ethereumImportEventsToWalletAccountAction.run({
    propsValue: props,
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<
    typeof ethereumImportEventsToWalletAccountAction.run
  >[0]);

const baseProps = {
  walletDocumentId: "w1",
  batchId: "run-1",
  importedAt: "2026-11-11T10:00:00.000Z",
};

beforeEach(() => {
  get.mockReset();
  execute.mockReset();
  execute.mockResolvedValue({});
});

describe("import-events-to-wallet-account", () => {
  it("dispatches only the unseen events with deterministic ids", async () => {
    get.mockResolvedValue(walletDoc([{ eventIdentifier: "0xa", sequenceIndex: 0 }]));

    const result = (await run({
      ...baseProps,
      eventsJson: JSON.stringify([event("0xa", 0), event("0xb", 0), event("0xb", 1)]),
    })) as { imported: number };

    expect(result.imported).toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
    const [docId, branch, actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: { events: Array<{ id: string }> } }>,
    ];
    expect(docId).toBe("w1");
    expect(branch).toBe("main");
    expect(actions[0].type).toBe("IMPORT_EVENTS");
    expect(actions[0].input.events.map((e) => e.id)).toEqual(["0xb-0", "0xb-1"]);
  });

  it("never dispatches when the ledger already holds everything", async () => {
    get.mockResolvedValue(
      walletDoc([
        { eventIdentifier: "0xa", sequenceIndex: 0 },
        { eventIdentifier: "0xa", sequenceIndex: 1 },
      ]),
    );

    const result = (await run({
      ...baseProps,
      eventsJson: JSON.stringify([event("0xa", 0), event("0xa", 1)]),
    })) as { imported: number };

    expect(result.imported).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("advances the cursor and records the native balance alongside", async () => {
    get.mockResolvedValue(walletDoc([{ eventIdentifier: "0xa", sequenceIndex: 0 }]));

    await run({
      ...baseProps,
      eventsJson: JSON.stringify([event("0xa", 0)]),
      scanProgressJson: JSON.stringify({ lastLogsBlock: 99, ranAt: "2026-11-11T10:00:01.000Z" }),
      nativeStateJson: JSON.stringify({ balance: "500", blockNumber: 99 }),
    });

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions.map((a) => a.type)).toEqual([
      "RECORD_SCAN_PROGRESS",
      "SET_NATIVE_BALANCE",
    ]);
    expect(actions[0].input).toEqual({
      lastLogsBlock: 99,
      lastNativeScanBlock: null,
      lastEventTimestamp: null,
      ranAt: "2026-11-11T10:00:01.000Z",
    });
    expect(actions[1].input).toEqual({
      amount: "500",
      blockNumber: 99,
      observedAt: "2026-11-11T10:00:00.000Z",
    });
  });

  it("retires the backfill to DONE when the walk passes the head", async () => {
    get.mockResolvedValue({
      header: { documentId: "w1", documentType: "stackfolio/wallet-account" },
      state: {
        global: {
          address: "0x1234",
          chainId: 1,
          ledger: [],
          backfill: { state: "NATIVE", startBlock: 100, nextBlock: 100 },
        },
      },
    });

    await run({
      ...baseProps,
      eventsJson: "[]",
      backfillDone: true,
      backfillNextBlock: 250,
    });

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions.map((a) => a.type)).toEqual(["SET_BACKFILL_STATE"]);
    expect(actions[0].input).toEqual({
      state: "DONE",
      startBlock: 100,
      nextBlock: 250,
    });
  });

  it("advances the backfill cursor while the walk continues", async () => {
    get.mockResolvedValue({
      header: { documentId: "w1", documentType: "stackfolio/wallet-account" },
      state: {
        global: {
          address: "0x1234",
          chainId: 1,
          ledger: [],
          backfill: { state: "NATIVE", startBlock: 100, nextBlock: 100 },
        },
      },
    });

    await run({
      ...baseProps,
      eventsJson: "[]",
      backfillDone: false,
      backfillNextBlock: 1100100,
    });

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions[0].input).toEqual({
      state: "NATIVE",
      startBlock: 100,
      nextBlock: 1100100,
    });
  });

  it("refuses documents of another type", async () => {
    get.mockResolvedValue({
      header: { documentId: "w1", documentType: "stackfolio/portfolio" },
      state: { global: {} },
    });

    await expect(
      run({ ...baseProps, eventsJson: JSON.stringify([event("0xa", 0)]) }),
    ).rejects.toThrow(/stackfolio\/wallet-account/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects malformed events", async () => {
    get.mockResolvedValue(walletDoc([]));
    await expect(run({ ...baseProps, eventsJson: "{" })).rejects.toThrow(
      /eventsJson/,
    );
  });
});

describe("import re-decode mode", () => {
  const held = (
    eventIdentifier: string,
    sequenceIndex: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: `${eventIdentifier}-${sequenceIndex}`,
    eventIdentifier,
    sequenceIndex,
    ignored: false,
    notes: null,
    counterpartyLabel: null,
    valuation: null,
    ...overrides,
  });

  const redecodeProps = {
    ...baseProps,
    redecode: true,
    redecodeNextBlock: 200_000,
  };

  it("replaces held rows and carries the pinned valuation", async () => {
    get.mockResolvedValue(
      walletDoc([
        held("0xa", 0, {
          ignored: true,
          notes: "mine",
          counterpartyLabel: "label",
          valuation: {
            unit: "EUR",
            price: "3700",
            source: "MANUAL",
            granularity: "NONE",
            pinnedAt: "2026-11-12T00:00:00.000Z",
          },
        }),
        held("0xkeep", 0),
      ]),
    );

    const result = (await run({
      ...redecodeProps,
      eventsJson: JSON.stringify([{ ...event("0xa", 0), counterparty: "aave-v3" }]),
    })) as { replaced: number };

    expect(result.replaced).toBe(1);
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions.map((a) => a.type)).toEqual([
      "REPLACE_EVENTS",
      "SET_REDECODE_STATE",
    ]);
    const replace = actions[0].input as {
      remove: Array<{ id: string; sequenceIndex: number }>;
      add: Array<Record<string, unknown>>;
    };
    expect(replace.remove).toEqual([{ id: "0xa-0", sequenceIndex: 0 }]);
    expect(replace.add[0].counterparty).toBe("aave-v3");
    // The review fields ride in the reducer; the valuation is carried here.
    expect(replace.add[0].valuation).toMatchObject({ price: "3700", source: "MANUAL" });
    expect((actions[1].input).nextBlock).toBe(200_000);
    expect((actions[1].input).state).toBe("NATIVE");
  });

  it("retires the retrofit to DONE at the head", async () => {
    get.mockResolvedValue(
      walletDoc([held("0xa", 0)]),
    );
    await run({
      ...redecodeProps,
      redecodeDone: true,
      eventsJson: JSON.stringify([event("0xa", 0)]),
    });
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions[1]).toMatchObject({
      type: "SET_REDECODE_STATE",
      input: { state: "DONE", startBlock: 0, nextBlock: 200_000 },
    });
  });

  it("advances the cursor even when the window holds nothing", async () => {
    get.mockResolvedValue(walletDoc([]));
    await run({ ...redecodeProps, eventsJson: "[]" });
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string }>,
    ];
    expect(actions.map((a) => a.type)).toEqual(["SET_REDECODE_STATE"]);
  });

  it("leaves the backfill and scan cursors alone", async () => {
    get.mockResolvedValue(
      walletDoc([held("0xa", 0)]),
    );
    await run({
      ...redecodeProps,
      backfillDone: true,
      backfillNextBlock: 999,
      scanProgressJson: JSON.stringify({ lastLogsBlock: 1, ranAt: "x" }),
      eventsJson: JSON.stringify([event("0xa", 0)]),
    });
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string }>,
    ];
    expect(actions.map((a) => a.type)).not.toContain("SET_BACKFILL_STATE");
    expect(actions.map((a) => a.type)).not.toContain("RECORD_SCAN_PROGRESS");
  });
});
