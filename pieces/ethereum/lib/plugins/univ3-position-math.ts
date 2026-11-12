/**
 * Uniswap V3 position math: what a concentrated-liquidity NFT is worth in
 * its two underlying tokens right now. Ported from the v3-core reference
 * (TickMath + LiquidityAmounts) in BigInt; every division rounds down the
 * same way FullMath.mulDiv does on-chain, so amounts match the contract's
 * collect() answers for a fresh position.
 */

const Q96 = 1n << 96n;
const MAX_UINT256 = (1n << 256n) - 1n;
const MIN_TICK = -887272;
const MAX_TICK = 887272;

/**
 * sqrt(1.0001^tick) * 2^96, the v3-core TickMath table. `tick 0` is
 * 2^96 and the extremes reproduce MIN/MAX_SQRT_RATIO exactly.
 */
export function sqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
    throw new RangeError(`tick ${tick} is outside ${MIN_TICK}..${MAX_TICK}`);
  }
  const absTick = BigInt(Math.abs(tick));
  let ratio: bigint;
  if ((absTick & 0x1n) !== 0n) ratio = 0xfffcb933bd6fad37aa2d162d1a594001n;
  else ratio = 0x100000000000000000000000000000000n;
  if ((absTick & 0x2n) !== 0n)
    ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4n) !== 0n)
    ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8n) !== 0n)
    ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10n) !== 0n)
    ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20n) !== 0n)
    ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40n) !== 0n)
    ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80n) !== 0n)
    ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100n) !== 0n)
    ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200n) !== 0n)
    ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400n) !== 0n)
    ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800n) !== 0n)
    ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000n) !== 0n)
    ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000n) !== 0n)
    ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000n) !== 0n)
    ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000n) !== 0n)
    ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000n) !== 0n)
    ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000n) !== 0n)
    ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000n) !== 0n)
    ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000n) !== 0n)
    ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;
  if (tick > 0) ratio = MAX_UINT256 / ratio;
  // Divide by 2^128 rounding up, then restate as a 96.96 fixed point.
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

function amount0ForLiquidity(
  sqrtRatioA: bigint,
  sqrtRatioB: bigint,
  liquidity: bigint,
): bigint {
  if (liquidity === 0n) return 0n;
  const [low, high] = sqrtRatioA < sqrtRatioB ? [sqrtRatioA, sqrtRatioB] : [sqrtRatioB, sqrtRatioA];
  return (liquidity * (high - low) * Q96) / (low * high);
}

function amount1ForLiquidity(
  sqrtRatioA: bigint,
  sqrtRatioB: bigint,
  liquidity: bigint,
): bigint {
  if (liquidity === 0n) return 0n;
  const [low, high] = sqrtRatioA < sqrtRatioB ? [sqrtRatioA, sqrtRatioB] : [sqrtRatioB, sqrtRatioA];
  return (liquidity * (high - low)) / Q96;
}

export interface Univ3PositionInput {
  /** Raw liquidity of the NFT (uint128 as a decimal string). */
  liquidity: string;
  /** The pool's current tick (slot0). */
  tickCurrent: number;
  tickLower: number;
  tickUpper: number;
  /** Only for labels: the math never needs the addresses. */
  token0: string;
  token1: string;
}

/**
 * Amounts (raw token units, decimal strings, rounded down) a burn would
 * pay out today: below the range all token0, above it all token1, inside
 * split at the current tick - the LiquidityAmounts.getAmountsForLiquidity
 * trichotomy.
 */
export function univ3PositionMath(input: Univ3PositionInput): {
  amount0: string;
  amount1: string;
} {
  if (!/^(0|[1-9][0-9]*)$/.test(input.liquidity)) {
    throw new RangeError(`liquidity ${input.liquidity} is not a uint integer`);
  }
  const liquidity = BigInt(input.liquidity);
  if (liquidity === 0n) return { amount0: "0", amount1: "0" };
  const sqrtLower = sqrtRatioAtTick(input.tickLower);
  const sqrtUpper = sqrtRatioAtTick(input.tickUpper);
  if (input.tickCurrent <= input.tickLower) {
    return {
      amount0: amount0ForLiquidity(sqrtLower, sqrtUpper, liquidity).toString(),
      amount1: "0",
    };
  }
  if (input.tickCurrent >= input.tickUpper) {
    return {
      amount0: "0",
      amount1: amount1ForLiquidity(sqrtLower, sqrtUpper, liquidity).toString(),
    };
  }
  const sqrtCurrent = sqrtRatioAtTick(input.tickCurrent);
  return {
    amount0: amount0ForLiquidity(sqrtCurrent, sqrtUpper, liquidity).toString(),
    amount1: amount1ForLiquidity(sqrtLower, sqrtCurrent, liquidity).toString(),
  };
}
