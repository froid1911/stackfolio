/**
 * Display formatters for the exact decimal strings the documents and the
 * index hold (wei, gwei, prices — never floats). The rules:
 * amounts round UP to the shown precision and fiat values DOWN, so a
 * balance is never shown larger than a viewer could sell and a value never
 * richer than it is; both show ">0" for a positive amount below the shown
 * unit rather than a zero, and "—" for a missing one. Inputs are unsigned
 * decimal strings.
 */

/** Trim trailing fractional zeros and the point. */
function trim(pointed: string): string {
  if (!pointed.includes(".")) return pointed;
  return pointed.replace(/\.?0+$/, "");
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Add one to a digit string (keeps leading zeros). Null on carry-out. */
function increment(digits: string): string | null {
  const at = digits.length - 1;
  if (at < 0) return null;
  if (digits[at] !== "9") {
    return digits.slice(0, at) + String(Number(digits[at]) + 1);
  }
  const carried = increment(digits.slice(0, at));
  return carried === null ? null : carried + "0";
}

interface Scaled {
  int: string;
  frac: string;
  positive: boolean;
  negative: boolean;
}

function scale(value: string, decimals: number): Scaled | null {
  // Borrowed position amounts are signed by the document model's rule
  // (negative = debt); the magnitude formats like any unsigned amount and
  // render() re-attaches the sign.
  const negative = value.startsWith("-");
  const magnitude = negative ? value.slice(1) : value;
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(magnitude)) return null;
  const [int, frac = ""] = magnitude.split(".");
  const digits = int + frac;
  // The shown point sits `decimals` places left of the input's own point.
  const shift = frac.length + decimals;
  const used = digits.padStart(shift + 1, "0");
  const cut = used.length - shift;
  return {
    int: used.slice(0, cut) || "0",
    frac: used.slice(cut),
    positive: !negative && /[1-9]/.test(digits),
    negative: negative && /[1-9]/.test(digits),
  };
}

function render(
  value: string | null | undefined,
  decimals: number,
  places: number | undefined,
  up: boolean,
): string {
  if (value === null || value === undefined) return "—";
  const scaled = scale(value, decimals);
  if (!scaled) return "—";
  const sign = scaled.negative ? "-" : "";
  let int = scaled.int;
  let frac: string;
  if (places === undefined) {
    frac = scaled.frac;
  } else {
    const keep = scaled.frac.slice(0, places).padEnd(places, "0");
    const rest = scaled.frac.slice(places);
    // An amount under one shown unit keeps its sign but not a fake digit:
    // ">0" / "<0", never an inflated 1 or -1.
    if (scaled.positive && int === "0" && /^0+$/.test(keep)) return ">0";
    if (scaled.negative && int === "0" && /^0+$/.test(keep)) return "<0";
    if (up && /[1-9]/.test(rest)) {
      const carried = increment(keep);
      if (carried === null) {
        int = String(Number(int) + 1);
        frac = "";
      } else {
        frac = carried;
      }
    } else {
      frac = keep;
    }
  }
  const shown = trim(`${int}${frac ? `.${frac}` : ""}`);
  if (!shown.includes(".")) return `${sign}${groupThousands(shown)}`;
  const [whole, part] = shown.split(".");
  return `${sign}${groupThousands(whole)}.${part}`;
}

/**
 * A base-unit decimal string (wei, token units) scaled by `decimals`.
 * `places` caps the shown fraction; without it every significant digit of
 * the asset's own precision is shown.
 */
export function fmtAmount(
  value: string | null | undefined,
  decimals: number,
  places?: number,
): string {
  return render(value, decimals, places, true);
}

/** A fiat decimal string, truncated at `places` (default 2). */
export function fmtFiat(
  value: string | null | undefined,
  places = 2,
): string {
  return render(value, 0, places, false);
}
