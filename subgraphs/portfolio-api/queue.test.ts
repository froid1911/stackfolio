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

  it("flags an inbound, unsigned, priced group from an address as a suspected airdrop", () => {
    expect(queueGroups([leg({})], new Set(), decimals).groups[0].suspectedAirdrop).toBe(true);
    expect(queueGroups([leg({})], new Set([`${W}|${TX}`]), decimals).groups[0].suspectedAirdrop).toBe(false);
    expect(queueGroups([leg({ price: null })], new Set(), decimals).groups[0].suspectedAirdrop).toBe(false);
    expect(queueGroups([leg({ counterparty: "uniswap-v2" })], new Set(), decimals).groups[0].suspectedAirdrop).toBe(false);
  });

  it("values a fractional price and leaves foreign-currency prices out", () => {
    expect(queueGroups([leg({ price: "0.123456789" })], new Set(), decimals).value).toBe("0.12345678");
    expect(queueGroups([leg({ priceUnit: "USD" })], new Set(), decimals).value).toBeNull();
  });
});
