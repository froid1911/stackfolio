import {
  addAddress,
  addBundle,
  reducer,
  removeBundle,
  updateBundle,
  utils,
} from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const HOT = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";
const COLD = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
const STRANGER = "0x0000000000000000000000000000000000000001";

const withWallets = () =>
  [HOT, COLD].reduce(
    (doc, address, i) =>
      reducer(
        doc,
        addAddress({
          id: `addr-${i}`,
          address,
          chainId: 1,
          timestamp: "2026-11-14T00:00:00.000Z",
        }),
      ),
    utils.createDocument(),
  );

const withBundle = () =>
  reducer(
    withWallets(),
    addBundle({ id: "b-1", name: "Long term", addresses: [COLD] }),
  );

const lastError = (doc: ReturnType<typeof withWallets>) =>
  doc.operations.global.at(-1)?.error;

describe("BundlesOperations", () => {
  it("should handle addBundle operation", () => {
    const document = reducer(
      withWallets(),
      addBundle({
        id: "b-1",
        name: "  Long term ",
        addresses: [COLD.toUpperCase().replace("0X", "0x"), COLD, HOT],
      }),
    );

    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.bundles).toEqual([
      { id: "b-1", name: "Long term", addresses: [COLD, HOT] },
    ]);
  });

  it("should handle updateBundle operation", () => {
    const document = reducer(
      withBundle(),
      updateBundle({ id: "b-1", name: "Everything", addresses: [HOT, COLD] }),
    );

    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.bundles[0]).toEqual({
      id: "b-1",
      name: "Everything",
      addresses: [HOT, COLD],
    });
  });

  it("should keep fields an update leaves out", () => {
    const renamed = reducer(withBundle(), updateBundle({ id: "b-1", name: "LT" }));
    expect(renamed.state.global.bundles[0].addresses).toEqual([COLD]);

    const moved = reducer(withBundle(), updateBundle({ id: "b-1", addresses: [HOT] }));
    expect(moved.state.global.bundles[0].name).toBe("Long term");
  });

  it("should let a bundle keep its own name in another case", () => {
    const document = reducer(
      withBundle(),
      updateBundle({ id: "b-1", name: "LONG TERM" }),
    );

    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.bundles[0].name).toBe("LONG TERM");
  });

  it("should handle removeBundle operation", () => {
    const document = reducer(withBundle(), removeBundle({ id: "b-1" }));

    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.bundles).toEqual([]);
    expect(document.state.global.addresses).toHaveLength(2);
  });

  it("should reject a bundle without a name", () => {
    const document = reducer(
      withWallets(),
      addBundle({ id: "b-1", name: "   ", addresses: [HOT] }),
    );

    expect(lastError(document)).toBe("A bundle needs a name");
    expect(document.state.global.bundles).toEqual([]);
  });

  it("should reject a bundle without wallets", () => {
    const document = reducer(
      withWallets(),
      addBundle({ id: "b-1", name: "Empty", addresses: [] }),
    );

    expect(lastError(document)).toBe("A bundle needs at least one wallet");
  });

  it("should reject a second bundle with the same name", () => {
    const document = reducer(
      withBundle(),
      addBundle({ id: "b-2", name: "long TERM", addresses: [HOT] }),
    );

    expect(lastError(document)).toBe("A bundle named long TERM exists");
    expect(document.state.global.bundles).toHaveLength(1);
  });

  it("should reject renaming onto another bundle's name", () => {
    const two = reducer(
      withBundle(),
      addBundle({ id: "b-2", name: "Trading", addresses: [HOT] }),
    );
    const document = reducer(two, updateBundle({ id: "b-2", name: "Long term" }));

    expect(lastError(document)).toBe("A bundle named Long term exists");
  });

  it("should reject a wallet the portfolio does not track", () => {
    const added = reducer(
      withWallets(),
      addBundle({ id: "b-1", name: "Mixed", addresses: [HOT, STRANGER] }),
    );
    expect(lastError(added)).toBe(`${STRANGER} is not in the portfolio`);

    const updated = reducer(
      withBundle(),
      updateBundle({ id: "b-1", addresses: [STRANGER] }),
    );
    expect(lastError(updated)).toBe(`${STRANGER} is not in the portfolio`);
    expect(updated.state.global.bundles[0].addresses).toEqual([COLD]);
  });

  it("should reject updating or removing an unknown bundle", () => {
    const updated = reducer(withWallets(), updateBundle({ id: "nope", name: "x" }));
    expect(lastError(updated)).toBe("Bundle nope does not exist");

    const removed = reducer(withWallets(), removeBundle({ id: "nope" }));
    expect(lastError(removed)).toBe("Bundle nope does not exist");
  });

  it("should add a bundle to a document made before bundles existed", () => {
    const old = withWallets();
    delete (old.state.global as { bundles?: unknown }).bundles;

    const document = reducer(
      old,
      addBundle({ id: "b-1", name: "First", addresses: [HOT] }),
    );

    expect(lastError(document)).toBeUndefined();
    expect(document.state.global.bundles).toHaveLength(1);
  });
});
