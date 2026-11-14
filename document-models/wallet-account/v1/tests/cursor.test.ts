import { generateMock } from "document-model/mock";
import {
  isWalletAccountDocument,
  recordScanProgress,
  reducer,
  setBackfillState,
  setNativeBalance,
  setRedecodeState,
  SetRedecodeStateInputSchema,
  setTokenBalances,
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

  it("should handle setRedecodeState operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetRedecodeStateInputSchema());

    const updatedDocument = reducer(document, setRedecodeState(input));

    expect(isWalletAccountDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    // A rejected operation records its error; give it the state it needs.
    expect(updatedDocument.operations.global[0].error).toBeUndefined();
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_REDECODE_STATE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setTokenBalances operation", () => {
    const USDT = "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7";
    const document = reducer(
      utils.createDocument(),
      setTokenBalances({
        blockNumber: 21_000_000,
        observedAt: "2026-11-14T12:00:00.000Z",
        balances: [
          { asset: USDT, amount: "0" },
          { asset: "eip155:1/erc20:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", amount: "184600" },
        ],
      }),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.tokenBalances).toEqual({
      blockNumber: 21_000_000,
      observedAt: "2026-11-14T12:00:00.000Z",
      balances: [
        { asset: USDT, amount: "0" },
        { asset: "eip155:1/erc20:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", amount: "184600" },
      ],
    });
  });

  it("replaces a reading with a newer one, at the same block too", () => {
    const at = (blockNumber: number, amount: string) =>
      setTokenBalances({
        blockNumber,
        observedAt: "2026-11-14T12:00:00.000Z",
        balances: [{ asset: "a", amount }],
      });
    let document = reducer(utils.createDocument(), at(100, "1"));
    document = reducer(document, at(100, "2"));
    document = reducer(document, at(101, "3"));
    expect(document.state.global.tokenBalances?.balances).toEqual([{ asset: "a", amount: "3" }]);
  });

  it("refuses a reading from an older block", () => {
    const at = (blockNumber: number) =>
      setTokenBalances({ blockNumber, observedAt: "2026-11-14T12:00:00.000Z", balances: [] });
    const document = reducer(reducer(utils.createDocument(), at(200)), at(199));
    expect(document.operations.global[1].error).toBe("A reading at block 199 is older than block 200");
    expect(document.state.global.tokenBalances?.blockNumber).toBe(200);
  });

  it("refuses a balance that is not a token amount", () => {
    const document = reducer(
      utils.createDocument(),
      setTokenBalances({
        blockNumber: 1,
        observedAt: "2026-11-14T12:00:00.000Z",
        balances: [{ asset: "a", amount: "-5" }],
      }),
    );
    expect(document.operations.global[0].error).toBe("a: -5 is not a token amount");
    expect(document.state.global.tokenBalances).toBeNull();
  });
});
