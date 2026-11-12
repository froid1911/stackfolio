import { describe, expect, it } from "vitest";
import { mapBlockscoutRows } from "./blockscout-rows.js";

const ADDR = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const OTHER = "0x0654874eb7f59c6f5b39931fc45dc45337c967c3";
const TOKEN = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";

const addr = (hash: string) => ({ hash });

describe("mapBlockscoutRows", () => {
  it("maps a received native tx and a sent fee row, chain-scoped", () => {
    const { events } = mapBlockscoutRows(10, ADDR, {
      txs: [
        {
          hash: "0xa1",
          from: addr(OTHER),
          to: addr(ADDR),
          value: "27000000000000000",
          status: "ok",
          timestamp: "2024-12-13T15:06:22.000000Z",
        },
        {
          hash: "0xa2",
          from: addr(ADDR),
          to: addr(OTHER),
          value: "0",
          status: "ok",
          fee: "230812705373244",
          timestamp: "2024-12-13T15:07:22.000000Z",
        },
      ],
      internal: [],
      transfers: [],
    });
    const receive = events.find((e) => e.eventIdentifier === "0xa1")!;
    expect(receive).toMatchObject({
      type: "RECEIVE",
      asset: "eip155:10/slip44:60",
      amount: "27000000000000000",
      counterparty: OTHER,
      timestamp: "2024-12-13T15:06:22.000Z",
    });
    const fee = events.find((e) => e.subtype === "FEE")!;
    expect(fee).toMatchObject({ amount: "230812705373244" });
  });

  it("keeps the fee row of a reverted tx and drops its value", () => {
    const { events } = mapBlockscoutRows(10, ADDR, {
      txs: [
        {
          hash: "0xb1",
          from: addr(ADDR),
          to: addr(OTHER),
          value: "5",
          status: "error",
          fee: "7",
          timestamp: "2024-12-13T15:06:22.000000Z",
        },
      ],
      internal: [],
      transfers: [],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ subtype: "FEE", amount: "7" });
  });

  it("maps internal traces and ERC-20 transfers, skipping NFTs", () => {
    const { events } = mapBlockscoutRows(10, ADDR, {
      txs: [],
      internal: [
        {
          transaction_hash: "0xc1",
          from: addr(ADDR),
          to: addr(OTHER),
          value: "9",
          timestamp: "2024-12-13T15:06:22.000000Z",
        },
      ],
      transfers: [
        {
          transaction_hash: "0xc2",
          type: "ERC-20",
          from: addr(OTHER),
          to: addr(ADDR),
          total: { value: "25834299836992853" },
          token: { address_hash: TOKEN },
          timestamp: "2024-12-13T15:05:01.000000Z",
        },
        {
          transaction_hash: "0xc3",
          type: "ERC-721",
          from: addr(OTHER),
          to: addr(ADDR),
          total: { value: "1" },
          token: { address_hash: TOKEN },
          timestamp: "2024-12-13T15:05:02.000000Z",
        },
      ],
    });
    const kinds = events.map((e) => `${e.notes ?? "token"}:${e.asset}`);
    expect(kinds).toContain("internal:eip155:10/slip44:60");
    expect(kinds).toContain(`token:eip155:10/erc20:${TOKEN}`);
    expect(events.find((e) => e.eventIdentifier === "0xc3")).toBeUndefined();
  });

  it("deduplicates by tx hash with sequence indices", () => {
    const { events } = mapBlockscoutRows(10, ADDR, {
      txs: [
        {
          hash: "0xd1",
          from: addr(ADDR),
          to: addr(OTHER),
          value: "3",
          status: "ok",
          fee: "1",
          timestamp: "2024-12-13T15:06:22.000000Z",
        },
      ],
      internal: [],
      transfers: [],
    });
    expect(events.map((e) => e.sequenceIndex)).toEqual([0, 1]);
  });
});
