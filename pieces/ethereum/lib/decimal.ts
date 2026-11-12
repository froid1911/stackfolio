const DECIMAL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

/**
 * Parse a plain decimal string into an integer scaled by `scale`. Exact:
 * no floating point is involved. Extra fraction digits beyond `scale` are
 * rejected - callers pick their scale deliberately.
 */
export function parseScaled(value: string, scale: number): bigint {
  if (!DECIMAL.test(value)) {
    throw new Error(`${value} is not a plain decimal number`);
  }
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = body.split(".");
  if (fraction.length > scale) {
    throw new Error(`${value} has more than ${scale} fraction digits`);
  }
  return (
    (BigInt(whole) * 10n ** BigInt(scale) +
      BigInt(fraction.padEnd(scale, "0") || "0")) *
    (negative ? -1n : 1n)
  );
}

/** Render a scaled integer back to a decimal string, trimming trailing
 * fraction zeros (never "-0"). */
export function formatScaled(scaled: bigint, scale: number): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled)
    .toString()
    .padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction =
    scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  if (negative && whole === "0" && fraction === "") return "0";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** value * amount / 10^decimals, exactly, at `scale` fraction digits.
 * `value` may carry more fraction digits than `scale` (a dust token's
 * CoinGecko price has 12 and more); the product keeps `scale` digits and
 * the remainder falls away, so a value too small to render at `scale` is
 * honestly zero rather than a thrown parse. */
export function scaledProduct(
  value: string,
  amountRaw: bigint,
  decimals: number,
  scale: number,
): bigint {
  const fraction = (value.split(".")[1] ?? "").length;
  const priceRaw = parseScaled(value, fraction);
  const num =
    priceRaw * amountRaw * 10n ** BigInt(Math.max(scale - fraction, 0));
  const den =
    10n ** BigInt(Math.max(fraction - scale, 0) + decimals);
  return num / den;
}
