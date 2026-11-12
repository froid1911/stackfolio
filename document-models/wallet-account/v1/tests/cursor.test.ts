import {
  recordScanProgress,
  reducer,
  setBackfillState,
  setNativeBalance,
  utils,
} from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";

describe("CursorOperations", () => {
  it("should handle recordScanProgress operation", () => {
    const document = reducer(
      utils.createDocument(),
      recordScanProgress({
        lastLogsBlock: 100,
        lastNativeScanBlock: 90,
        lastEventTimestamp: "2026-11-10T00:00:00.000Z",
        ranAt: "2026-11-11T00:00:00.000Z",
      }),
    );

    expect(document.state.global.cursor).toEqual({
      lastLogsBlock: 100,
      lastNativeScanBlock: 90,
      lastEventTimestamp: "2026-11-10T00:00:00.000Z",
      lastRunAt: "2026-11-11T00:00:00.000Z",
    });
  });

  it("should accept equal or greater block cursors", () => {
    let document = reducer(
      utils.createDocument(),
      recordScanProgress({
        lastLogsBlock: 100,
        ranAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      recordScanProgress({
        lastLogsBlock: 100,
        ranAt: "2026-11-11T01:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      recordScanProgress({
        lastLogsBlock: 150,
        ranAt: "2026-11-11T02:00:00.000Z",
      }),
    );

    expect(document.operations.global[2].error).toBeUndefined();
    expect(document.state.global.cursor?.lastLogsBlock).toBe(150);
  });

  it("should reject a regressing logs cursor", () => {
    let document = reducer(
      utils.createDocument(),
      recordScanProgress({
        lastLogsBlock: 100,
        ranAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      recordScanProgress({
        lastLogsBlock: 99,
        ranAt: "2026-11-11T01:00:00.000Z",
      }),
    );

    expect(document.operations.global[1].error).toBe(
      "lastLogsBlock would regress from 100 to 99",
    );
    expect(document.state.global.cursor?.lastLogsBlock).toBe(100);
  });

  it("should reject a regressing native scan cursor", () => {
    let document = reducer(
      utils.createDocument(),
      recordScanProgress({
        lastNativeScanBlock: 200,
        ranAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      recordScanProgress({
        lastNativeScanBlock: 100,
        ranAt: "2026-11-11T01:00:00.000Z",
      }),
    );

    expect(document.operations.global[1].error).toBe(
      "lastNativeScanBlock would regress from 200 to 100",
    );
  });

  it("should handle setBackfillState operation", () => {
    let document = reducer(
      utils.createDocument(),
      setBackfillState({ state: "IDLE", startBlock: null, nextBlock: null }),
    );
    document = reducer(
      document,
      setBackfillState({
        state: "LOGS",
        startBlock: 18000000,
        nextBlock: 18000500,
      }),
    );

    expect(document.state.global.backfill).toEqual({
      state: "LOGS",
      startBlock: 18000000,
      nextBlock: 18000500,
    });
  });

  it("should handle setNativeBalance operation", () => {
    let document = reducer(
      utils.createDocument(),
      setNativeBalance({
        amount: "2.5",
        blockNumber: 21000000,
        observedAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      setNativeBalance({
        amount: "2.75",
        blockNumber: 21000100,
        observedAt: "2026-11-11T01:00:00.000Z",
      }),
    );

    expect(document.state.global.nativeBalance).toEqual({
      amount: "2.75",
      blockNumber: 21000100,
      observedAt: "2026-11-11T01:00:00.000Z",
    });
  });

  it("should reject a stale or same-timestamp balance observation", () => {
    let document = reducer(
      utils.createDocument(),
      setNativeBalance({
        amount: "2.5",
        blockNumber: 21000000,
        observedAt: "2026-11-11T01:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      setNativeBalance({
        amount: "0",
        blockNumber: 1,
        observedAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    expect(document.operations.global[1].error).toContain("is not newer than");

    document = reducer(
      document,
      setNativeBalance({
        amount: "9",
        blockNumber: 2,
        observedAt: "2026-11-11T01:00:00.000Z",
      }),
    );
    expect(document.operations.global[2].error).toContain("is not newer than");
    expect(document.state.global.nativeBalance?.amount).toBe("2.5");
  });
});
