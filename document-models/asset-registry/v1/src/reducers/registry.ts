import type { AssetRegistryRegistryOperations } from "document-models/asset-registry/v1";
import {
  AssetNotFoundError,
  DuplicateAssetError,
  NotCustomAssetError,
} from "../../gen/registry/error.js";

export const assetRegistryRegistryOperations: AssetRegistryRegistryOperations =
  {
    registerAssetOperation(state, action) {
      if (state.assets.some((a) => a.identifier === action.input.identifier)) {
        throw new DuplicateAssetError(
          `Asset ${action.input.identifier} is already registered`,
        );
      }
      state.assets.push({
        id: action.input.id,
        identifier: action.input.identifier,
        symbol: action.input.symbol,
        name: action.input.name,
        decimals: action.input.decimals,
        kind: action.input.kind,
        chainId: action.input.chainId,
        coingeckoId: action.input.coingeckoId ?? null,
        underlying: action.input.underlying ?? null,
        custom: action.input.custom,
        addedAt: action.input.addedAt,
      });
    },
    updateAssetOperation(state, action) {
      const asset = state.assets.find(
        (a) => a.identifier === action.input.identifier,
      );
      if (!asset)
        throw new AssetNotFoundError(
          `Asset ${action.input.identifier} is not registered`,
        );
      if (action.input.symbol != null) asset.symbol = action.input.symbol;
      if (action.input.name != null) asset.name = action.input.name;
      if (action.input.decimals != null) asset.decimals = action.input.decimals;
      if (action.input.kind != null) asset.kind = action.input.kind;
      if (action.input.underlying != null)
        asset.underlying = action.input.underlying;
    },
    setCoingeckoIdOperation(state, action) {
      const asset = state.assets.find(
        (a) => a.identifier === action.input.identifier,
      );
      if (!asset)
        throw new AssetNotFoundError(
          `Asset ${action.input.identifier} is not registered`,
        );
      asset.coingeckoId = action.input.coingeckoId ?? null;
    },
    removeAssetOperation(state, action) {
      const index = state.assets.findIndex(
        (a) => a.identifier === action.input.identifier,
      );
      if (index === -1)
        throw new AssetNotFoundError(
          `Asset ${action.input.identifier} is not registered`,
        );
      if (!state.assets[index].custom)
        throw new NotCustomAssetError("Only custom assets can be removed");
      state.assets.splice(index, 1);
    },
  };
