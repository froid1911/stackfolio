import { beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const PEER = "0x2222222222222222222222222222222222222222";

const { getBlockNumber, getBlockWithTxs, getBlockReceipts } = vi.hoisted(
  () => ({
    getBlockNumber: vi.fn(),
    getBlockWithTxs: vi.fn(),
    getBlockReceipts: vi.fn(),
  }),
);

vi.mock("../client.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    createClientBundle: () => ({
      getBlockNumber,
      getBlockWithTxs,
      getBlockReceipts,
    }),
  };
});

import { ethereumScanNativeTransactionsAction } from "./scan-native-transactions.js";

interface TestRow {
  eventIdentifier: string;
  sequenceIndex: number;
  type: string;
  subtype: string;
  asset: string;
  amount: string;
  counterparty: string;
}

const tx = (
  hash: string,
  from: string,
  to: string | null,
  value: bigint,
) => ({ hash, from, to, value });

const receipt = (transactionHash: string) => ({
  transactionHash,
  gasUsed: 21_000n,
  effectiveGasPrice: 1_000_000_000n,
});

const block = (
  number: number,
  transactions: Array<ReturnType<typeof tx>>,
  withdrawals: Array<{ index: number; address: string; amountGwei: number }> = [],
) => ({
  number,
  timestamp: `2026-11-1${number % 10}T00:00:00.000Z`,
  hash: `0xblock${number}`,
  transactions,
  withdrawals,
});

const walletDoc = {
  header: { documentType: "stackfolio/wallet-account" },
  state: {
    global: {
      address: ACCOUNT,
      chainId: 1,
      cursor: { lastLogsBlock: 50 },
      backfill: { state: "NATIVE", startBlock: 0, nextBlock: 10 },
    },
  },
};

const runAction = async (
  doc: unknown,
  props: Record<string, unknown> = {},
) =>
  (await ethereumScanNativeTransactionsAction.run({
    propsValue: { accountDocumentId: "doc-1", maxBlocks: 3, direction: "BACKFILL", ...props },
    auth: { props: { rpcUrl: "http://127.0.0.1:8545" } },
    reactor: { get: vi.fn().mockResolvedValue(doc) },
    // The framework context carries flow plumbing the action never reads.
  } as unknown as Parameters<typeof ethereumScanNativeTransactionsAction.run>[0])) as {
    rows: TestRow[];
    nextBlock: number;
    done: boolean;
  };

beforeEach(() => {
  getBlockNumber.mockReset();
  getBlockWithTxs.mockReset();
  getBlockReceipts.mockReset();
});

describe("scan-native-transactions", () => {
  it("walks the backfill window and decodes native moves, fees and withdrawals", async () => {
    getBlockNumber.mockResolvedValue(12n);
    getBlockWithTxs
      .mockResolvedValueOnce(
        block(10, [
          tx("0xt1", ACCOUNT, PEER, 2_000_000_000_000_000_000n),
          tx("0xt2", PEER, ACCOUNT, 1_000_000_000_000_000_000n),
          tx("0xt3", ACCOUNT, ACCOUNT, 500_000_000_000_000_000n),
          tx("0xt4", PEER, "0x3333333333333333333333333333333333333333", 1n),
        ]),
      )
      .mockResolvedValueOnce(block(11, []))
      .mockResolvedValueOnce(
        block(
          12,
          [tx("0xt5", ACCOUNT, PEER, 700_000_000_000_000_000n)],
          [{ index: 5000001, address: ACCOUNT, amountGwei: 1_000_000 }],
        ),
      );
    getBlockReceipts.mockImplementation((blockNumber: bigint) => {
      const source =
        Number(blockNumber) === 10
          ? ["0xt1", "0xt2", "0xt3", "0xt4"]
          : Number(blockNumber) === 12
            ? ["0xt5"]
            : [];
      return source.map(receipt);
    });

    const page = await runAction(walletDoc);

    expect(page.nextBlock).toBe(13);
    expect(page.done).toBe(true);
    const rows = page.rows;

    const key = (r: TestRow) => `${r.eventIdentifier}/${r.sequenceIndex}`;
    const byKey = new Map(rows.map((r) => [key(r), r]));

    // Block 10: one SPEND of 2 ETH, one RECEIVE of 1 ETH.
    expect(byKey.get("0xt1/0")).toMatchObject({
      type: "SPEND",
      amount: "2000000000000000000",
      counterparty: PEER,
      asset: "eip155:1/slip44:60",
    });
    expect(byKey.get("0xt2/1")).toMatchObject({
      type: "RECEIVE",
      amount: "1000000000000000000",
      counterparty: PEER,
    });
    // The self-transfer books one of each.
    expect(byKey.get("0xt3/0")).toMatchObject({ type: "SPEND", amount: "500000000000000000" });
    expect(byKey.get("0xt3/1")).toMatchObject({ type: "RECEIVE", amount: "500000000000000000" });
    // A fee row per account-initiated tx, after the move row.
    expect(byKey.get("0xt1/2")).toMatchObject({
      type: "SPEND",
      subtype: "FEE",
      amount: "21000000000000",
    });
    expect(byKey.get("0xt3/2")).toMatchObject({ subtype: "FEE" });
    expect(byKey.get("0xt5/2")).toMatchObject({ subtype: "FEE" });
    // Block 12's withdrawal is a STAKING row, gwei converted to ETH.
    expect(byKey.get("withdrawal-5000001/0")).toMatchObject({
      type: "STAKING",
      subtype: "WITHDRAWAL",
      amount: "1000000000000000",
      counterparty: ACCOUNT,
    });
    // The unrelated transfer produced nothing.
    expect(byKey.has("0xt4/0")).toBe(false);
  });

  it("stops at maxBlocks and asks to be rerun", async () => {
    getBlockNumber.mockResolvedValue(50n);
    getBlockWithTxs.mockResolvedValue(block(10, []));
    getBlockReceipts.mockResolvedValue([]);

    const page = await runAction(walletDoc, { maxBlocks: 3 });

    expect(page.nextBlock).toBe(13);
    expect(page.done).toBe(false);
    expect(
      getBlockWithTxs.mock.calls.map((c: unknown[]) => c[0]),
    ).toEqual([10n, 11n, 12n]);
  });

  it("reports done at once when the backfill is already past the head", async () => {
    getBlockNumber.mockResolvedValue(9n);

    const page = await runAction(walletDoc);

    expect(page).toEqual({
      rows: [],
      nextBlock: 10,
      done: true,
      accountDocumentId: "doc-1",
    });
    expect(getBlockWithTxs).not.toHaveBeenCalled();
  });

  it("walks the head window when there is no cursor at all", async () => {
    getBlockNumber.mockResolvedValue(100n);
    getBlockWithTxs.mockImplementation(async (n: bigint) =>
      block(Number(n), []),
    );
    getBlockReceipts.mockResolvedValue([]);

    const doc = {
      ...walletDoc,
      state: { global: { ...walletDoc.state.global, backfill: null } },
    };
    const page = await runAction(doc, { direction: "HEAD" });

    expect(page.nextBlock).toBe(101);
    expect(getBlockWithTxs).toHaveBeenCalledWith(98n);
    expect(getBlockWithTxs).toHaveBeenCalledWith(100n);
  });

  it("rejects a document that never started a backfill", async () => {
    const doc = {
      ...structuredClone(walletDoc),
      state: {
        global: { ...walletDoc.state.global, backfill: null },
      },
    };

    await expect(runAction(doc)).rejects.toThrow(/backfill/);
  });
});
