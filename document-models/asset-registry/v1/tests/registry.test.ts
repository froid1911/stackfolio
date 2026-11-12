import { generateMock } from "document-model/mock";
import {
  isAssetRegistryDocument,
  reducer,
  registerAsset,
  RegisterAssetInputSchema,
  removeAsset,
  setCoingeckoId,
  updateAsset,
  utils,
} from "document-models/asset-registry/v1";
import { describe, expect, it } from "vitest";

const IDENTIFIER = "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const registerInput = (overrides: Record<string, unknown> = {}) => ({
  id: "asset-usdc",
  identifier: IDENTIFIER,
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  kind: "ERC20" as const,
  chainId: 1,
  coingeckoId: "usd-coin",
  custom: true,
  addedAt: "2026-11-11T00:00:00.000Z",
  ...overrides,
});

/** A document holding one registered USDC. */
const withAsset = () =>
  reducer(utils.createDocument(), registerAsset(registerInput()));

describe("RegistryOperations", () => {
  it("should handle registerAsset operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RegisterAssetInputSchema(), {
      addedAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, registerAsset(input));

    expect(isAssetRegistryDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].error).toBeUndefined();
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REGISTER_ASSET",
    );
    expect(updatedDocument.state.global.assets).toHaveLength(1);
  });

  it("should handle updateAsset operation", () => {
    const document = withAsset();

    const updatedDocument = reducer(
      document,
      updateAsset({ identifier: IDENTIFIER, symbol: "USDC2", decimals: 7 }),
    );

    expect(updatedDocument.operations.global[1].error).toBeUndefined();
    const asset = updatedDocument.state.global.assets[0];
    expect(asset.symbol).toBe("USDC2");
    expect(asset.decimals).toBe(7);
    expect(asset.name).toBe("USD Coin");
  });

  it("should handle setCoingeckoId operation", () => {
    const document = withAsset();

    const updatedDocument = reducer(
      document,
      setCoingeckoId({ identifier: IDENTIFIER, coingeckoId: "other-id" }),
    );

    expect(updatedDocument.operations.global[1].error).toBeUndefined();
    expect(updatedDocument.state.global.assets[0].coingeckoId).toBe("other-id");
  });

  it("should handle removeAsset operation", () => {
    const document = withAsset();

    const updatedDocument = reducer(
      document,
      removeAsset({ identifier: IDENTIFIER }),
    );

    expect(updatedDocument.operations.global[1].error).toBeUndefined();
    expect(updatedDocument.state.global.assets).toHaveLength(0);
  });

  it("should reject registering a duplicate identifier", () => {
    const document = withAsset();

    const updatedDocument = reducer(
      document,
      registerAsset(registerInput({ id: "asset-usdc-2" })),
    );

    expect(updatedDocument.operations.global[1].error).toBe(
      `Asset ${IDENTIFIER} is already registered`,
    );
    expect(updatedDocument.state.global.assets).toHaveLength(1);
  });

  it("should reject updating an unknown asset", () => {
    const updatedDocument = reducer(
      utils.createDocument(),
      updateAsset({ identifier: IDENTIFIER, symbol: "NOPE" }),
    );

    expect(updatedDocument.operations.global[0].error).toBe(
      `Asset ${IDENTIFIER} is not registered`,
    );
    expect(updatedDocument.state.global.assets).toHaveLength(0);
  });

  it("should reject setting a coingecko id on an unknown asset", () => {
    const updatedDocument = reducer(
      utils.createDocument(),
      setCoingeckoId({ identifier: IDENTIFIER, coingeckoId: "x" }),
    );

    expect(updatedDocument.operations.global[0].error).toBe(
      `Asset ${IDENTIFIER} is not registered`,
    );
  });

  it("should reject removing an unknown asset", () => {
    const updatedDocument = reducer(
      utils.createDocument(),
      removeAsset({ identifier: IDENTIFIER }),
    );

    expect(updatedDocument.operations.global[0].error).toBe(
      `Asset ${IDENTIFIER} is not registered`,
    );
  });

  it("should reject removing a non-custom asset", () => {
    const document = reducer(
      utils.createDocument(),
      registerAsset(
        registerInput({
          id: "asset-eth",
          identifier: "eip155:1/slip44:60",
          symbol: "ETH",
          name: "Ether",
          decimals: 18,
          kind: "NATIVE",
          custom: false,
        }),
      ),
    );

    const updatedDocument = reducer(
      document,
      removeAsset({ identifier: "eip155:1/slip44:60" }),
    );

    expect(updatedDocument.operations.global[1].error).toBe(
      "Only custom assets can be removed",
    );
    expect(updatedDocument.state.global.assets).toHaveLength(1);
  });

  it("should clear a coingecko id with null", () => {
    const document = withAsset();

    const updatedDocument = reducer(
      document,
      setCoingeckoId({ identifier: IDENTIFIER, coingeckoId: null }),
    );

    expect(updatedDocument.state.global.assets[0].coingeckoId).toBeNull();
  });
});
