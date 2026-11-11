import { actions, reducer, utils } from "document-models/asset-registry/v1";
import { describe, expect, it } from "vitest";

const { registerAsset, updateAsset, setCoingeckoId, removeAsset } = actions;

/** One flow, as the ethereum piece and the Assets editor would drive it. */
describe("registry scenario", () => {
  it("registers, updates, maps and removes a lifecycle", () => {
    let document = utils.createDocument();

    document = reducer(
      document,
      registerAsset({
        id: "asset-eth",
        identifier: "eip155:1/slip44:60",
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        kind: "NATIVE",
        chainId: 1,
        coingeckoId: "ethereum",
        custom: false,
        addedAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      registerAsset({
        id: "asset-usdc",
        identifier: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        kind: "ERC20",
        chainId: 1,
        coingeckoId: null,
        custom: true,
        addedAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    // A rerun of the same import batch is rejected, leaving both assets.
    document = reducer(
      document,
      registerAsset({
        id: "asset-usdc-dupe",
        identifier: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        kind: "ERC20",
        chainId: 1,
        coingeckoId: null,
        custom: true,
        addedAt: "2026-11-11T00:00:00.000Z",
      }),
    );
    expect(document.operations.global[2].error).toContain("already registered");

    document = reducer(
      document,
      setCoingeckoId({
        identifier: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        coingeckoId: "usd-coin",
      }),
    );
    document = reducer(
      document,
      updateAsset({
        identifier: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        name: "USD Circle Coin",
      }),
    );
    // The native coin survives removal attempts; the token does not.
    document = reducer(
      document,
      removeAsset({ identifier: "eip155:1/slip44:60" }),
    );
    document = reducer(
      document,
      removeAsset({
        identifier: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      }),
    );

    expect(document.operations.global).toHaveLength(7);
    expect(document.operations.global[5].error).toBe(
      "Only custom assets can be removed",
    );
    expect(document.state.global.assets).toHaveLength(1);
    expect(document.state.global.assets[0].identifier).toBe(
      "eip155:1/slip44:60",
    );
  });
});
