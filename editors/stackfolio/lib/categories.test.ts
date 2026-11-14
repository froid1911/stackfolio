import { describe, expect, it } from "vitest";
import {
  CATEGORY_CHOICES,
  CATEGORY_LABEL,
  isAddress,
  overridesInput,
  parseEventKey,
  ruleInput,
} from "./categories.js";

describe("category helpers", () => {
  it("names every choice", () => {
    for (const { options } of CATEGORY_CHOICES) {
      for (const option of options) expect(CATEGORY_LABEL[option]).toBeTruthy();
    }
  });

  it("splits an event key", () => {
    expect(parseEventKey("0xab|ev-1|3")).toEqual({ wallet: "0xab", eventId: "ev-1", sequenceIndex: 3 });
  });

  it("builds overrides, the giver's basis only on a received gift", () => {
    expect(overridesInput(["0xab|e|0"], "GIFT_IN", { cost: " 10.5 ", acquiredAt: "" })).toEqual({
      overrides: [{ wallet: "0xab", eventId: "e", sequenceIndex: 0, category: "GIFT_IN", giftCost: "10.5" }],
    });
    expect(overridesInput(["0xab|e|0"], "LOST", { cost: "1" }).overrides[0]).not.toHaveProperty("giftCost");
  });

  it("builds a rule input with an optional label", () => {
    expect(ruleInput("r", "0xCAFE", "IN", "INCOME", "  ")).toEqual({
      id: "r",
      counterparty: "0xcafe",
      direction: "IN",
      category: "INCOME",
    });
    expect(ruleInput("r", "0xcafe", "OUT", "SPEND", " Shop ")).toMatchObject({ label: "Shop" });
  });

  it("tells an address from a protocol id", () => {
    expect(isAddress("0xd152f549545093347a162dce210e7293f1452150")).toBe(true);
    expect(isAddress("uniswap-v2")).toBe(false);
    expect(isAddress(null)).toBe(false);
  });
});
