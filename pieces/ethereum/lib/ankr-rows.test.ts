import { describe, expect, it } from "vitest";
import { mapAnkrRows } from "./ankr-rows.js";
import type { AnkrTx } from "./ankr.js";

const SELF = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const OTHER = "0x0000000000000000000000000000000000000002";
const TOKEN = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC on Base
const TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topic(address: string): string {
  return `0x000000000000000000000000${address.slice(2)}`;
}

function tx(over: Partial<AnkrTx>): AnkrTx {
  return {
    hash: "0xaa",
    from: SELF,
    to: OTHER,
    value: "0x0",
    blockNumber: "0x10",
    timestamp: "0x67000000",
    gasUsed: "0x5208",
    gasPrice: "0x1",
    status: "0x1",
    ...over,
  };
}

describe("mapAnkrRows", () => {
  it("splits a native send into value and fee rows", () => {
    const { events } = mapAnkrRows(8453, SELF, {
      txs: [tx({ value: "0x2386f26fc10000", gasUsed: "0x5208", gasPrice: "0x2" })],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      eventIdentifier: "0xaa",
      sequenceIndex: 0,
      type: "SPEND",
      subtype: "NONE",
      asset: "eip155:8453/slip44:60",
      amount: "10000000000000000",
      counterparty: OTHER,
    });
    expect(events[1]).toMatchObject({
      sequenceIndex: 1,
      type: "SPEND",
      subtype: "FEE",
      amount: String(0x5208 * 0x2),
      notes: "gas",
    });
  });

  it("keeps the fee row of a failed send but drops its value", () => {
    const { events } = mapAnkrRows(8453, SELF, {
      txs: [tx({ value: "0xde0b6b3a7640000", status: "0x0" })],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.subtype).toBe("FEE");
  });

  it("reads an incoming native transfer as RECEIVE", () => {
    const { events } = mapAnkrRows(43114, SELF, {
      txs: [tx({ from: OTHER, to: SELF, value: "0x1" })],
    });
    expect(events[0]).toMatchObject({
      type: "RECEIVE",
      asset: "eip155:43114/slip44:60",
      counterparty: OTHER,
    });
  });

  it("decodes embedded ERC-20 Transfer logs into token rows", () => {
    const { events } = mapAnkrRows(8453, SELF, {
      txs: [
        tx({
          value: "0x0",
          gasUsed: "0x0",
          logs: [
            {
              address: TOKEN,
              topics: [TRANSFER, topic(SELF), topic(OTHER)],
              data: "0x0000000000000000000000000000000000000000000000000000000005f5e100",
            },
            {
              // Unrelated event: ignored.
              address: TOKEN,
              topics: ["0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"],
              data: "0x0",
            },
          ],
        }),
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "SPEND",
      subtype: "NONE",
      asset: "eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      amount: "100000000",
      counterparty: OTHER,
      notes: "token",
    });
  });

  it("marks removed logs dead and strangers invisible", () => {
    const { events } = mapAnkrRows(56, "0x0000000000000000000000000000000000000009", {
      txs: [
        tx({
          from: "0x0000000000000000000000000000000000000008",
          logs: [
            {
              address: TOKEN,
              topics: [TRANSFER, topic(SELF), topic(OTHER)],
              data: "0x5",
              removed: true,
            },
          ],
        }),
      ],
    });
    expect(events).toHaveLength(0);
  });
});
