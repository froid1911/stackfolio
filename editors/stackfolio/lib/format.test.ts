import { describe, expect, it } from "vitest";
import { fmtAmount, fmtFiat } from "./format.js";

describe("fmtAmount", () => {
  it("scales a decimal string by the asset's decimals and keeps precision", () => {
    expect(fmtAmount("2000000000000000000", 18)).toBe("2");
    expect(fmtAmount("1234567890123456789", 18)).toBe(
      "1.234567890123456789",
    );
  });

  it("rounds UP on display so a balance never looks smaller than it is", () => {
    // one wei below 1.000... : rounding up at 4 shown decimals
    expect(fmtAmount("999999999999999999", 18, 4)).toBe("1");
    expect(fmtAmount("1.00009", 0, 4)).toBe("1.0001");
  });

  it("never renders a positive balance as zero, nor as an inflated unit", () => {
    expect(fmtAmount("1", 18, 4)).toBe(">0");
    expect(fmtAmount("0.000011", 0, 4)).toBe(">0");
    expect(fmtAmount("0", 18, 4)).toBe("0");
  });

  it("separates thousands and answers an em dash for missing amounts", () => {
    expect(fmtAmount("1234567.89", 0, 2)).toBe("1,234,567.89");
    expect(fmtAmount(null, 18)).toBe("—");
    expect(fmtAmount("", 18)).toBe("—");
  });
});

describe("fmtFiat", () => {
  it("rounds values DOWN so a portfolio never claims more than it holds", () => {
    expect(fmtFiat("123.4599", 2)).toBe("123.45");
    expect(fmtFiat("123", 2)).toBe("123");
  });

  it("groups thousands and flags a positive-but-rounding-to-zero value", () => {
    expect(fmtFiat("1234567.987", 2)).toBe("1,234,567.98");
    expect(fmtFiat("0.004", 2)).toBe(">0");
    expect(fmtFiat(null)).toBe("—");
  });
});
