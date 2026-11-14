export type ErrorCode =
  | "EMPTY_BUNDLE"
  | "DUPLICATE_BUNDLE_NAME"
  | "UNKNOWN_BUNDLE_ADDRESS"
  | "BUNDLE_NOT_FOUND";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class EmptyBundleError extends Error implements ReducerError {
  errorCode = "EMPTY_BUNDLE" as ErrorCode;
  constructor(message = "EmptyBundleError") {
    super(message);
  }
}

export class DuplicateBundleNameError extends Error implements ReducerError {
  errorCode = "DUPLICATE_BUNDLE_NAME" as ErrorCode;
  constructor(message = "DuplicateBundleNameError") {
    super(message);
  }
}

export class UnknownBundleAddressError extends Error implements ReducerError {
  errorCode = "UNKNOWN_BUNDLE_ADDRESS" as ErrorCode;
  constructor(message = "UnknownBundleAddressError") {
    super(message);
  }
}

export class BundleNotFoundError extends Error implements ReducerError {
  errorCode = "BUNDLE_NOT_FOUND" as ErrorCode;
  constructor(message = "BundleNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddBundle: {
    EmptyBundleError,
    DuplicateBundleNameError,
    UnknownBundleAddressError,
  },

  UpdateBundle: {
    BundleNotFoundError,
    EmptyBundleError,
    DuplicateBundleNameError,
    UnknownBundleAddressError,
  },

  RemoveBundle: { BundleNotFoundError },
};
