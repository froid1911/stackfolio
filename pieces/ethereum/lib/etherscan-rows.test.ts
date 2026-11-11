import { describe, expect, it } from "vitest";
import { mapEtherscanRows } from "./etherscan-rows.js";

const ADDR = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const OTHER = "0x5c647ca5e2bc5bd17c40410fcB8003d38879ae50";

describe("mapEtherscanRows", () => {
  it("maps a received native transfer", () => {
    const { events } = mapEtherscanRows(ADDR, {
      txs: [
        {
          hash: "0xaa",
          timeStamp: "1730000000",
          from: OTHER,
          to: ADDR,
          value: "1000000000000000000",
          gasUsed: "21000",
          gasPrice: "20000000000",
          status: "1",
        },
      ],
      internal: [],
      tokentxs: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventIdentifier: "0xaa",
      sequenceIndex: 0,
      timestamp: "2024-10-27T03:33:20.000Z",
      type: "RECEIVE",
      subtype: "NONE",
      asset: "eip155:1/slip44:60",
      amount: "1000000000000000000",
      counterparty: OTHER.toLowerCase(),
    });
  });

  it("adds the fee row for a sent successful tx and orders it after the transfer", () => {
    const { events } = mapEtherscanRows(ADDR, {
      txs: [
        {
          hash: "0xbb",
          timeStamp: "1730000000",
          from: ADDR,
          to: OTHER,
          value: "2000000000000000000",
          gasUsed: "21000",
          gasPrice: "20000000000",
          status: "1",
        },
      ],
      internal: [],
      tokentxs: [],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      eventIdentifier: "0xbb",
      sequenceIndex: 0,
      type: "SPEND",
      subtype: "NONE",
      amount: "2000000000000000000",
      counterparty: OTHER.toLowerCase(),
    });
    expect(events[1]).toMatchObject({
      eventIdentifier: "0xbb",
      sequenceIndex: 1,
      type: "SPEND",
      subtype: "FEE",
      asset: "eip155:1/slip44:60",
      amount: "420000000000000",
      notes: "gas",
    });
  });

  it("a failed sent tx yields only the fee row", () => {
    const { events } = mapEtherscanRows(ADDR, {
      txs: [
        {
          hash: "0xcc",
          timeStamp: "1730000000",
          from: ADDR,
          to: OTHER,
          value: "500000000000000000",
          gasUsed: "52000",
          gasPrice: "10000000000",
          status: "0",
        },
      ],
      internal: [],
      tokentxs: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "SPEND",
      subtype: "FEE",
      amount: "520000000000000",
    });
  });

  it("a zero-value successful tx yields no transfer row", () => {
    const { events } = mapEtherscanRows(ADDR, {
      txs: [
        {
          hash: "0xdd",
          timeStamp: "1730000000",
          from: ADDR,
          to: "0x0000000000000000000000000000000000001337",
          value: "0",
          gasUsed: "60000",
          gasPrice: "10000000000",
          status: "1",
        },
      ],
      internal: [],
      tokentxs: [],
    });
    expect(events.every((e) => e.subtype === "FEE")).toBe(true);
    expect(events.filter((e) => e.subtype !== "FEE")).toHaveLength(0);
  });

  it("skips the internal msg.value mirror but keeps real internal transfers", () => {
    const { events } = mapEtherscanRows(ADDR, {
      txs: [
        {
          hash: "0xee",
          timeStamp: "1730000000",
          from: ADDR,
          to: "0x000000000000000000000000000000000000dead",
          value: "1000000000000000000",
          gasUsed: "50000",
          gasPrice: "10000000000",
          status: "1",
        },
      ],
      internal: [
        {
          hash: "0xee",
          from: ADDR,
          to: "0x000000000000000000000000000000000000dead",
          value: "1000000000000000000",
          timeStamp: "1730000000",
          traceAddress: "[]",
        },
        {
          hash: "0xee",
          from: ADDR,
          to: OTHER,
          value: "700000000000000000",
          timeStamp: "1730000000",
          traceAddress: "[0]",
        },
        {
          hash: "0xee",
          from: "0x000000000000000000000000000000000000dead",
          to: ADDR,
          value: "300000000000000000",
          timeStamp: "1730000000",
          traceAddress: "[1]",
          errValue: "Reverted",
        },
      ],
      tokentxs: [],
    });
    const nonFee = events.filter((e) => e.subtype !== "FEE");
    expect(nonFee).toHaveLength(2);
    expect(nonFee[0]).toMatchObject({ type: "SPEND", amount: "1000000000000000000" });
    expect(nonFee[1]).toMatchObject({
      type: "SPEND",
      amount: "700000000000000000",
      notes: "internal",
      counterparty: OTHER.toLowerCase(),
    });
    const counted = nonFee
      .filter((e) => e.subtype !== "FEE")
      .reduce(
        (sum, e) =>
          sum +
          (e.type === "SPEND" ? -BigInt(e.amount) : BigInt(e.amount)),
        0n,
      );
    expect(counted).toBe(-1700000000000000000n);
  });

  it("maps tokentx to the CAIP-19 erc20 asset, lowercased", () => {
    const { events } = mapEtherscanRows(ADDR, {
      txs: [],
      internal: [],
      tokentxs: [
        {
          hash: "0xff",
          timeStamp: "1730000000",
          from: ADDR,
          to: OTHER,
          contractAddress: "0x1F9840000000000000000000000000000000000",
          value: "2500000000000000000",
        },
      ],
    });
    expect(events[0]).toMatchObject({
      eventIdentifier: "0xff",
      type: "SPEND",
      asset: "eip155:1/erc20:0x1f9840000000000000000000000000000000000",
      amount: "2500000000000000000",
      counterparty: OTHER.toLowerCase(),
    });
  });

  it("maps approvals to INFORMATIONAL/APPROVE", () => {
    const { events } = mapEtherscanRows(ADDR, {
      txs: [],
      internal: [],
      tokentxs: [],
      approvals: [
        {
          transactionHash: "0xa1",
          approvalDate: "1730000000",
          value: "115792089237316195423570985008687907853269984665640564039457",
          tokenContract: "0x1F984000000000000000000000000000000000",
          tokenSymbol: "USDC",
          tokenName: "USD Coin",
          spender: OTHER,
        },
      ],
    });
    expect(events[0]).toMatchObject({
      eventIdentifier: "0xa1",
      type: "INFORMATIONAL",
      subtype: "APPROVE",
      asset: "eip155:1/erc20:0x1f984000000000000000000000000000000000",
      counterparty: OTHER.toLowerCase(),
      notes: "USDC",
    });
  });

  it("is deterministic: mapping the same input twice answers identically", () => {
    const input = {
      txs: [
        {
          hash: "0xbb",
          timeStamp: "1730000000",
          from: ADDR,
          to: OTHER,
          value: "1",
          gasUsed: "21000",
          gasPrice: "1",
          status: "1",
        },
      ],
      internal: [
        {
          hash: "0xbb",
          from: OTHER,
          to: ADDR,
          value: "1",
          timeStamp: "1730000000",
          traceAddress: "[0]",
        },
      ],
      tokentxs: [
        {
          hash: "0xbb",
          timeStamp: "1730000000",
          from: ADDR,
          to: OTHER,
          contractAddress: "0x1f9840a85d5aF5bf1D1762F925BDADc4204Ff00d",
          value: "9",
        },
      ],
    };
    const a = mapEtherscanRows(ADDR, input).events;
    const b = mapEtherscanRows(ADDR, input).events;
    expect(a).toEqual(b);
    expect(new Set(a.map((e) => `${e.eventIdentifier}:${e.sequenceIndex}`)).size).toBe(
      a.length,
    );
  });
});
