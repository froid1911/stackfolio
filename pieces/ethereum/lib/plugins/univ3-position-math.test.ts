import { describe, expect, it } from "vitest";
import {
  sqrtRatioAtTick,
  univ3PositionMath,
} from "./univ3-position-math.js";

const position = (
  liquidity: string,
  tickCurrent: number,
  tickLower: number,
  tickUpper: number,
) =>
  univ3PositionMath({
    liquidity,
    tickCurrent,
    tickLower,
    tickUpper,
    token0: "0x000000000000000000000000000000000000000a",
    token1: "0x000000000000000000000000000000000000000b",
  });

describe("sqrtRatioAtTick", () => {
  it("reproduces the reference constants", () => {
    expect(sqrtRatioAtTick(0)).toBe(1n << 96n);
    // MIN_SQRT_RATIO of the v3-core oracle equals TickMath(MIN_TICK);
    // TickMath(MAX_TICK) is the value the sol reference table produces.
    expect(sqrtRatioAtTick(-887272)).toBe(4295128739n);
    expect(sqrtRatioAtTick(887272)).toBe(
      1461446703485210103287273052203988822378723970342n,
    );
  });

  it("matches the sol reference across the range", () => {
    // Values recomputed from TickMath.sol with exact integer arithmetic.
    const golden: Array<[number, string]> = [
      [-850000, "27687702323"],
      [-4152, "64376084292685097131629972063"],
      [60, "79466191966197645195421774833"],
      [443, "81002556466511200104722273154"],
      [100000, "11755562826496067164730007768450"],
    ];
    for (const [tick, expected] of golden) {
      expect(sqrtRatioAtTick(tick).toString()).toBe(expected);
    }
  });

  it("steps by sqrt(1.0001) per tick", () => {
    const ratio = (sqrtRatioAtTick(1) * 10000n) / (1n << 96n);
    // 1.00005 per tick, scaled by 1e4: 10000.5 truncated to 10000.
    expect(ratio).toBeGreaterThanOrEqual(10000n);
    expect(ratio).toBeLessThanOrEqual(10001n);
  });

  it("rejects ticks outside the supported range", () => {
    expect(() => sqrtRatioAtTick(-887273)).toThrow(RangeError);
    expect(() => sqrtRatioAtTick(887273)).toThrow(RangeError);
    expect(() => sqrtRatioAtTick(1.5)).toThrow(RangeError);
  });
});

describe("univ3PositionMath", () => {
  it("is all token0 below the range", () => {
    const amounts = position("1000000000000", -100, -60, 60);
    expect(amounts.amount1).toBe("0");
    expect(BigInt(amounts.amount0)).toBeGreaterThan(0n);
  });

  it("is all token1 above the range", () => {
    const amounts = position("1000000000000", 100, -60, 60);
    expect(amounts.amount0).toBe("0");
    expect(BigInt(amounts.amount1)).toBeGreaterThan(0n);
  });

  it("is near-proportional for a tight symmetric range at price 1", () => {
    const { amount0, amount1 } = position("1000000000000", 0, -60, 60);
    const a0 = BigInt(amount0);
    const a1 = BigInt(amount1);
    expect(a0).toBeGreaterThan(0n);
    // Price sits at 1 across the band, so equal value means equal amounts.
    const diff = a1 > a0 ? a1 - a0 : a0 - a1;
    expect((diff * 1000n) / (a0 > a1 ? a0 : a1)).toBeLessThan(10n);
  });

  it("splits an in-range position exactly at the current tick", () => {
    // Same range entered at tick 30 vs tick 0: more of the rising side.
    const at0 = position("500000000000", 0, -60, 60);
    const at30 = position("500000000000", 30, -60, 60);
    expect(BigInt(at30.amount0)).toBeLessThan(BigInt(at0.amount0));
    expect(BigInt(at30.amount1)).toBeGreaterThan(BigInt(at0.amount1));
  });

  it("pays nothing for zero or burned liquidity", () => {
    expect(position("0", 0, -60, 60)).toEqual({ amount0: "0", amount1: "0" });
  });

  it("rejects non-integer liquidity", () => {
    expect(() => position("1.5", 0, -60, 60)).toThrow(RangeError);
    expect(() => position("-2", 0, -60, 60)).toThrow(RangeError);
  });
});
