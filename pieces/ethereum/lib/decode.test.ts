import { describe, expect, it } from "vitest";
import {
  TRANSFER_TOPIC,
  amountFromData,
  chunkRange,
  decodeTransferLogs,
  erc20Asset,
  topicForAddress,
  type TransferLog,
} from "./decode.js";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const PEER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const ONE_ETH_DATA = `0x${"0".repeat(44)}0de0b6b3a7640000`;

const transferLog = (overrides: Partial<TransferLog> = {}): TransferLog => ({
  address: TOKEN,
  topics: [TRANSFER_TOPIC, topicForAddress(PEER), topicForAddress(ACCOUNT)],
  data: ONE_ETH_DATA,
  logIndex: 3,
  blockNumber: 21_000_000n,
  transactionHash: "0xaaaa",
  ...overrides,
});

const timestamps = new Map<number, string>([
  [21_000_000, "2026-11-10T12:00:00.000Z"],
]);

describe("decode helpers", () => {
  it("topicForAddress left-pads a lowercase 40-hex address", () => {
    expect(topicForAddress("0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48")).toBe(
      `0x${"0".repeat(24)}a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`,
    );
  });

  it("erc20Asset builds a CAIP-10 identifier, lowercased", () => {
    expect(erc20Asset(1, `0x${"A".repeat(40)}`)).toBe(
      `eip155:1/erc20:0x${"a".repeat(40)}`,
    );
  });

  it("amountFromData reads the uint256 payload", () => {
    expect(amountFromData(ONE_ETH_DATA)).toBe("1000000000000000000");
    expect(amountFromData("0x0")).toBe("0");
  });
});

describe("decodeTransferLogs", () => {
  it("maps an incoming transfer to RECEIVE with the sender as counterparty", () => {
    const rows = decodeTransferLogs(
      [transferLog()],
      ACCOUNT,
      1,
      timestamps,
    );

    expect(rows).toEqual([
      {
        eventIdentifier: "0xaaaa",
        sequenceIndex: 3,
        timestamp: "2026-11-10T12:00:00.000Z",
        type: "RECEIVE",
        subtype: "NONE",
        asset: `eip155:1/erc20:${TOKEN}`,
        amount: "1000000000000000000",
        counterparty: PEER,
        notes: null,
      },
    ]);
  });

  it("maps an outgoing transfer to SPEND with the receiver as counterparty", () => {
    const rows = decodeTransferLogs(
      [
        transferLog({
          topics: [
            TRANSFER_TOPIC,
            topicForAddress(ACCOUNT),
            topicForAddress(PEER),
          ],
        }),
      ],
      ACCOUNT,
      1,
      timestamps,
    );

    expect(rows[0].type).toBe("SPEND");
    expect(rows[0].counterparty).toBe(PEER);
  });

  it("treats a self-transfer as a SPEND", () => {
    const rows = decodeTransferLogs(
      [
        transferLog({
          topics: [
            TRANSFER_TOPIC,
            topicForAddress(ACCOUNT),
            topicForAddress(ACCOUNT),
          ],
        }),
      ],
      ACCOUNT,
      1,
      timestamps,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("SPEND");
  });

  it("ignores logs that neither involve the account nor are Transfers", () => {
    const unrelated = transferLog({
      topics: [
        TRANSFER_TOPIC,
        topicForAddress(PEER),
        topicForAddress("0x3333333333333333333333333333333333333333"),
      ],
    });
    const approval = transferLog({
      topics: [
        `0x${"8".repeat(64)}`,
        topicForAddress(PEER),
        topicForAddress(ACCOUNT),
      ],
    });

    expect(
      decodeTransferLogs([unrelated, approval], ACCOUNT, 1, timestamps),
    ).toEqual([]);
  });

  it("refuses a log whose block timestamp was not supplied", () => {
    expect(() =>
      decodeTransferLogs([transferLog()], ACCOUNT, 1, new Map()),
    ).toThrow(/block 21000000/);
  });
});

describe("chunkRange", () => {
  it("splits an inclusive block range into bounded chunks", () => {
    expect(chunkRange(0, 999, 500)).toEqual([
      [0, 499],
      [500, 999],
    ]);
    expect(chunkRange(10, 10, 500)).toEqual([[10, 10]]);
    expect(chunkRange(0, 1000, 500)).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1000],
    ]);
  });

  it("rejects nonsense ranges", () => {
    expect(chunkRange(5, 4, 500)).toEqual([]);
    expect(() => chunkRange(0, 10, 0)).toThrow(/maxBlocks/);
  });
});
