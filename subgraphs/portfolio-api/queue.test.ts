import { describe, expect, it } from "vitest";
import { queueGroups, type QueueLeg } from "./queue.js";

const W = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const TX = `0x${"1".repeat(64)}`;
const TOKEN = "eip155:1/erc20:0xaa";
const decimals = new Map([[TOKEN, 18]]);
const leg = (over: Partial<QueueLeg>): QueueLeg => ({
  wallet: W,
  eventId: "e",
  sequenceIndex: 0,
  eventIdentifier: TX,
  timestamp: "2026-05-01T00:00:00.000Z",
  type: "RECEIVE",
  asset: TOKEN,
  amount: "1000000000000000000",
  counterparty: "0xBEEF",
  price: "2",
  priceUnit: "EUR",
  ...over,
});

describe("queueGroups", () => {
  it("groups by counterparty and direction, largest EUR value first", () => {
    const out = queueGroups(
      [
        leg({ eventId: "a" }),
        leg({ eventId: "b", amount: "3000000000000000000" }),
        leg({ eventId: "c", type: "SPEND", counterparty: "0xcafe", price: "100" }),
        leg({ eventId: "d", counterparty: null, price: null }),
      ],
      new Set([`${W}|${TX}`]),
      decimals,
    );
    expect(out.total).toBe(4);
    expect(out.value).toBe("108");
    expect(out.groups.map((g) => [g.counterparty, g.direction, g.count, g.value])).toEqual([
      ["0xcafe", "OUT", 1, "100"],
      ["0xbeef", "IN", 2, "8"],
      [null, "IN", 1, null],
    ]);
    expect(out.groups[1].events).toEqual([`${W}|a|0`, `${W}|b|0`]);
  });

  it("flags a pushed, priced token the wallet never held before as a suspected airdrop", () => {
    const first = new Map([[`${W}|${TOKEN}`, "2026-05-01T00:00:00.000Z"]]);
    const flag = (over: Partial<QueueLeg>, signed = new Set<string>(), seen = first) =>
      queueGroups([leg(over)], signed, decimals, seen).groups[0].suspectedAirdrop;
    expect(flag({})).toBe(true);
    expect(flag({}, new Set([`${W}|${TX}`]))).toBe(false);
    expect(flag({ price: null })).toBe(false);
    expect(flag({ counterparty: "uniswap-v2" })).toBe(false);
    // Held before: a withdrawal from an exchange, not an airdrop.
    expect(flag({}, new Set(), new Map([[`${W}|${TOKEN}`, "2025-01-01T00:00:00.000Z"]]))).toBe(false);
    // A native coin is never an airdrop.
    const eth = "eip155:1/slip44:60";
    expect(
      queueGroups([leg({ asset: eth })], new Set(), new Map([[eth, 18]]), new Map([[`${W}|${eth}`, "2026-05-01T00:00:00.000Z"]]))
        .groups[0].suspectedAirdrop,
    ).toBe(false);
  });

  it("values a fractional price and leaves foreign-currency prices out", () => {
    expect(queueGroups([leg({ price: "0.123456789" })], new Set(), decimals).value).toBe("0.12345678");
    expect(queueGroups([leg({ priceUnit: "USD" })], new Set(), decimals).value).toBeNull();
  });
});
