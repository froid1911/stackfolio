import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSFER_TOPIC, topicForAddress } from "../decode.js";
import type { ScanPage } from "../types.js";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const PEER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const { getLogs, getBlockNumber, getBlockTimestamp, getBalance, getNonce } =
  vi.hoisted(() => ({
    getLogs: vi.fn(),
    getBlockNumber: vi.fn(),
    getBlockTimestamp: vi.fn(),
    getBalance: vi.fn(),
    getNonce: vi.fn(),
  }));

vi.mock("../client.js", async (importOriginal) => {
  // Keep the real module (auth.ts reads its URL constants); swap only the
  // bundle factory.
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    createClientBundle: () => ({
      getLogs,
      getBlockNumber,
      getBlockTimestamp,
      getBalance,
      getNonce,
    }),
  };
});

// Static import: vi.mock above is hoisted before it runs, so the action
// already sees the fakes.
import { ethereumScanAccountLogsAction } from "./scan-account-logs.js";

const transferLog = (overrides: Record<string, unknown> = {}) => ({
  address: TOKEN,
  topics: [TRANSFER_TOPIC, topicForAddress(PEER), topicForAddress(ACCOUNT)],
  data: `0x${"0".repeat(44)}0de0b6b3a7640000`,
  logIndex: 0,
  blockNumber: 21_000_000n,
  transactionHash: "0xaaaa",
  ...overrides,
});

const walletDoc = (lastLogsBlock: number | null) => ({
  header: { documentType: "stackfolio/wallet-account" },
  state: {
    global: {
      address: ACCOUNT,
      chainId: 1,
      cursor: lastLogsBlock === null ? null : { lastLogsBlock },
    },
  },
});

const context = (
  doc: unknown,
  props: Record<string, unknown> = {},
) => ({
  propsValue: {
    accountDocumentId: "doc-1",
    maxBlocks: 500,
    maxLogs: 5000,
    ...props,
  },
  auth: {
    props: {
      rpcUrl: "http://127.0.0.1:8545",
      beaconUrl: "http://127.0.0.1:5052",
      chainId: 1,
    },
  },
  reactor: { get: vi.fn().mockResolvedValue(doc) },
});

const runAction = async (
  doc: unknown,
  props?: Record<string, unknown>,
): Promise<ScanPage & { accountDocumentId: string }> =>
  // The framework hands the real run a much larger context; the action
  // only reads propsValue, auth and reactor, so the fake carries just those.
  (await ethereumScanAccountLogsAction.run(
    context(doc, props) as unknown as Parameters<
      typeof ethereumScanAccountLogsAction.run
    >[0],
  )) as ScanPage & { accountDocumentId: string };

beforeEach(() => {
  getLogs.mockReset();
  getBlockNumber.mockReset();
  getBlockTimestamp.mockReset();
  getBalance.mockReset();
  getNonce.mockReset();
});

describe("scan-account-logs", () => {
  it("scans from the cursor and returns a decoded page", async () => {
    getBlockNumber.mockResolvedValue(21_000_010n);
    getLogs
      .mockResolvedValueOnce([transferLog()])
      .mockResolvedValueOnce([]);
    getBlockTimestamp.mockResolvedValue("2026-11-10T12:00:00.000Z");

    const page = await runAction(walletDoc(20_999_999));

    // The cursor was at 20999999, so the page starts at the next block.
    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 21_000_000n,
        toBlock: 21_000_010n,
        topics: [TRANSFER_TOPIC, topicForAddress(ACCOUNT)],
      }),
    );
    // And the second query scans the receiving direction.
    expect(getLogs).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        topics: [TRANSFER_TOPIC, null, topicForAddress(ACCOUNT)],
      }),
    );
    expect(page.truncated).toBe(false);
    expect(page.lastBlock).toBe(21_000_010);
    expect(page.tokens).toEqual([TOKEN]);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].type).toBe("RECEIVE");
  });

  it("dedupes a self-transfer seen from both directions", async () => {
    const selfTopics = [
      TRANSFER_TOPIC,
      topicForAddress(ACCOUNT),
      topicForAddress(ACCOUNT),
    ];
    getBlockNumber.mockResolvedValue(100n);
    getLogs
      .mockResolvedValueOnce([transferLog({ topics: selfTopics })])
      .mockResolvedValueOnce([
        transferLog({ topics: selfTopics, blockNumber: 100n }),
      ]);
    getBlockTimestamp.mockResolvedValue("2026-11-10T12:00:00.000Z");

    const page = await runAction(walletDoc(0));

    expect(page.rows).toHaveLength(1);
  });

  it("flags truncation when one block overflows maxLogs and stops there", async () => {
    getBlockNumber.mockResolvedValue(100n);
    const flood = Array.from({ length: 2 }, (_unused, index) =>
      transferLog({ transactionHash: `0xf${index}`, logIndex: index }),
    );
    getLogs.mockResolvedValue(flood);

    const page = await runAction(walletDoc(0), { maxLogs: 2, maxBlocks: 500 });

    expect(page.truncated).toBe(true);
    // Nothing after the overflow point is claimed; the cursor stays put.
    expect(page.rows).toEqual([]);
    expect(page.lastBlock).toBe(0);
    // Halving happened instead of a blind second full query.
    expect(getLogs.mock.calls.length).toBeGreaterThan(2);
  });

  it("returns an empty page when the cursor is already at the head", async () => {
    getBlockNumber.mockResolvedValue(100n);

    const page = await runAction(walletDoc(100));

    expect(page).toEqual({
      rows: [],
      lastBlock: 100,
      tokens: [],
      truncated: false,
      accountDocumentId: "doc-1",
    });
    expect(getLogs).not.toHaveBeenCalled();
  });

  it("discovers the history start when no cursor exists yet", async () => {
    getBlockNumber.mockResolvedValue(2_000_000n);
    // The chain came alive at block 1_000_000; discovery binary-searches
    // there and the scan starts a lag behind it, not at genesis.
    getBalance.mockImplementation(
      async (_a: string, block?: bigint) =>
        (block ?? 0n) >= 1_000_000n ? 1n : 0n,
    );
    getNonce.mockImplementation(
      async (_a: string, block?: bigint) =>
        (block ?? 0n) >= 1_000_000n ? 1 : 0,
    );
    getLogs.mockResolvedValue([]);

    await runAction(walletDoc(null));

    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 998_000n }),
    );
  });

  it("scans from head when the account has never been active", async () => {
    getBlockNumber.mockResolvedValue(5n);
    getBalance.mockResolvedValue(0n);
    getNonce.mockResolvedValue(0);
    getLogs.mockResolvedValue([]);

    const page = await runAction(walletDoc(null));

    expect(getLogs).toHaveBeenCalledWith(
      expect.objectContaining({ fromBlock: 5n, toBlock: 5n }),
    );
    expect(page.lastBlock).toBe(5);
  });

  it("refuses a document that is not a wallet account", async () => {
    await expect(
      runAction({ header: { documentType: "stackfolio/portfolio" }, state: {} }),
    ).rejects.toThrow(/stackfolio\/wallet-account/);
  });

  it("refuses an account whose address is not set yet", async () => {
    const doc = walletDoc(0);
    doc.state.global.address = "";

    await expect(runAction(doc)).rejects.toThrow(/address/);
  });
});
