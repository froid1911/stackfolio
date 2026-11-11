export type ErrorCode = "ASSET_EXISTS" | "ASSET_NOT_FOUND" | "ASSET_NOT_CUSTOM";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateAssetError extends Error implements ReducerError {
  errorCode = "ASSET_EXISTS" as ErrorCode;
  constructor(message = "DuplicateAssetError") {
    super(message);
  }
}

export class AssetNotFoundError extends Error implements ReducerError {
  errorCode = "ASSET_NOT_FOUND" as ErrorCode;
  constructor(message = "AssetNotFoundError") {
    super(message);
  }
}

export class NotCustomAssetError extends Error implements ReducerError {
  errorCode = "ASSET_NOT_CUSTOM" as ErrorCode;
  constructor(message = "NotCustomAssetError") {
    super(message);
  }
}

export const errors = {
  RegisterAsset: { DuplicateAssetError },

  UpdateAsset: { AssetNotFoundError },

  SetCoingeckoId: { AssetNotFoundError },

  RemoveAsset: { AssetNotFoundError, NotCustomAssetError },
};
