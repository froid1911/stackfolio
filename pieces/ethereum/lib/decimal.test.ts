import { describe, expect, it } from "vitest";

import { formatScaled, parseScaled, scaledProduct } from "./decimal.js";

describe("decimal helpers", () => {
  it("round-trips plain decimals through a scale", () => {
    expect(parseScaled("2950.1", 8)).toBe(295_010_000_000n);
    expect(parseScaled("-0.5", 8)).toBe(-50_000_000n);
    expect(formatScaled(295_010_000_000n, 8)).toBe("2950.1");
    expect(formatScaled(-50_000_000n, 8)).toBe("-0.5");
    expect(formatScaled(0n, 8)).toBe("0");
    expect(formatScaled(-1n, 8)).toBe("-0.00000001");
    // A signed zero parses to plain zero.
    expect(parseScaled("-0.00000000", 8)).toBe(0n);
  });

  it("rejects malformed input and excess precision", () => {
    expect(() => parseScaled("1e5", 8)).toThrow(/plain decimal/);
    expect(() => parseScaled("0.123456789", 8)).toThrow(/fraction digits/);
    expect(() => parseScaled("", 8)).toThrow(/plain decimal/);
  });

  it("values raw amounts exactly", () => {
    // 2.499979 ETH at 2000 EUR, raw wei input.
    const scaled = scaledProduct(
      "2000",
      2_499_979_000_000_000_000n,
      18,
      8,
    );
    expect(formatScaled(scaled, 8)).toBe("4999.958");
    // 1 USDC (6 decimals) at 0.95.
    expect(formatScaled(scaledProduct("0.95", 1_000_000n, 6, 8), 8)).toBe("0.95");
    // Negative balance values keep the sign.
    expect(formatScaled(scaledProduct("2000", -1_000_000_000_000_000_000n, 18, 8), 8)).toBe(
      "-2000",
    );
  });

  it("values a price finer than the scale instead of throwing", () => {
    // A dead token's CoinGecko price carries 12 fraction digits; the
    // product keeps the scale's 8 and the remainder falls away.
    expect(
      formatScaled(scaledProduct("0.000000001084", 10n ** 24n, 18, 8), 8),
    ).toBe("0.001084");
    expect(formatScaled(scaledProduct("0.000000001084", 1n, 0, 8), 8)).toBe(
      "0",
    );
    expect(
      formatScaled(scaledProduct("0.000000001084", 5n * 10n ** 21n, 18, 8), 8),
    ).toBe("0.00000542");
  });
});
