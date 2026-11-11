import { actions, reducer, utils } from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const { setPriceOverride, removePriceOverride, setAssetIgnored } = actions;

const ASSET = "eip155:1/slip44:60";

describe("PricingOperations", () => {
  it("should handle setPriceOverride operation", () => {
    const document = reducer(
      utils.createDocument(),
      setPriceOverride({
        asset: ASSET,
        price: "3123.45",
        setAt: "2026-11-11T00:00:00.000Z",
      }),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.priceOverrides).toEqual([
      { asset: ASSET, price: "3123.45", setAt: "2026-11-11T00:00:00.000Z" },
    ]);
  });

  it("should upsert an override for the same asset", () => {
    let document = reducer(
      utils.createDocument(),
      setPriceOverride({
        asset: ASSET,
        price: "1",
        setAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      setPriceOverride({
        asset: ASSET,
        price: "2.5",
        setAt: "2026-11-12T00:00:00.000Z",
      }),
    );

    expect(document.state.global.priceOverrides).toHaveLength(1);
    expect(document.state.global.priceOverrides[0]).toEqual({
      asset: ASSET,
      price: "2.5",
      setAt: "2026-11-12T00:00:00.000Z",
    });
  });

  it("should reject a price that is not a decimal", () => {
    const document = reducer(
      utils.createDocument(),
      setPriceOverride({
        asset: ASSET,
        price: "12.3.4",
        setAt: "2026-11-11T00:00:00.000Z",
      }),
    );

    expect(document.operations.global[0].error).toBe(
      "12.3.4 is not a decimal amount",
    );
    expect(document.state.global.priceOverrides).toHaveLength(0);
  });

  it("should handle removePriceOverride operation", () => {
    let document = reducer(
      utils.createDocument(),
      setPriceOverride({
        asset: ASSET,
        price: "1",
        setAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    document = reducer(document, removePriceOverride({ asset: ASSET }));

    expect(document.state.global.priceOverrides).toHaveLength(0);

    // Removing what is not there is a no-op, not an error.
    document = reducer(document, removePriceOverride({ asset: ASSET }));
    expect(document.operations.global[2].error).toBeUndefined();
  });

  it("should handle setAssetIgnored operation", () => {
    let document = reducer(
      utils.createDocument(),
      setAssetIgnored({ asset: ASSET, ignored: true }),
    );
    document = reducer(
      document,
      setAssetIgnored({ asset: ASSET, ignored: true }),
    );
    expect(document.state.global.ignoredAssets).toEqual([ASSET]);

    document = reducer(
      document,
      setAssetIgnored({ asset: ASSET, ignored: false }),
    );
    expect(document.state.global.ignoredAssets).toEqual([]);
  });
});
