import { describe, expect, it } from "vitest";
import { bundleProblem } from "../components/Bundles.js";
import { bundlesOf, inScope, scoped, scopeOf, type Bundle } from "./bundles.js";

const HOT = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";
const COLD = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
const LONG: Bundle = { id: "b-1", name: "Long term", addresses: [COLD] };

describe("bundlesOf", () => {
  it("reads the portfolio's bundles", () => {
    expect(bundlesOf({ state: { global: { bundles: [LONG] } } })).toEqual([LONG]);
  });

  it("reads a document made before bundles as none", () => {
    expect(bundlesOf({ state: { global: {} } })).toEqual([]);
    expect(bundlesOf(undefined)).toEqual([]);
  });

  it("drops entries that are not bundles", () => {
    expect(
      bundlesOf({ state: { global: { bundles: [LONG, null, { id: "x" }, "y"] } } }),
    ).toEqual([LONG]);
  });
});

describe("scopeOf", () => {
  it("is every wallet without a bundle param", () => {
    expect(scopeOf([LONG], undefined)).toEqual({ bundles: [LONG], active: null, wallets: null });
  });

  it("narrows to the named bundle's wallets, lower-cased", () => {
    const scope = scopeOf([{ ...LONG, addresses: [COLD.toUpperCase()] }], "b-1");
    expect(scope.active?.name).toBe("Long term");
    expect([...(scope.wallets ?? [])]).toEqual([COLD.toUpperCase().toLowerCase()]);
  });

  it("reads a bundle that is gone as every wallet", () => {
    expect(scopeOf([LONG], "deleted").wallets).toBeNull();
  });
});

describe("inScope and scoped", () => {
  const wallets = new Set([COLD]);

  it("keeps everything without a bundle", () => {
    expect(inScope(null, HOT)).toBe(true);
    expect(scoped(null, [1, 2], () => null)).toEqual([1, 2]);
  });

  it("keeps the bundle's wallets, matching any case", () => {
    expect(inScope(wallets, COLD.toUpperCase())).toBe(true);
    expect(inScope(wallets, HOT)).toBe(false);
    expect(inScope(wallets, null)).toBe(false);
    expect(
      scoped(wallets, [{ wallet: HOT }, { wallet: COLD }], (r) => r.wallet),
    ).toEqual([{ wallet: COLD }]);
  });
});

describe("bundleProblem", () => {
  it("asks for a name and a wallet", () => {
    expect(bundleProblem([], { id: null, name: " ", addresses: [HOT] })).toBe(
      "Give the bundle a name.",
    );
    expect(bundleProblem([], { id: null, name: "Trading", addresses: [] })).toBe(
      "Pick at least one wallet.",
    );
  });

  it("refuses another bundle's name, ignoring case, but not its own", () => {
    expect(bundleProblem([LONG], { id: null, name: "long TERM", addresses: [HOT] })).toBe(
      "A bundle named long TERM exists.",
    );
    expect(bundleProblem([LONG], { id: "b-1", name: "LONG TERM", addresses: [HOT] })).toBeNull();
  });
});
