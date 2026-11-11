export type ErrorCode = "ADDRESS_KNOWN" | "ADDRESS_NOT_FOUND";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class AddressKnownError extends Error implements ReducerError {
  errorCode = "ADDRESS_KNOWN" as ErrorCode;
  constructor(message = "AddressKnownError") {
    super(message);
  }
}

export class AddressNotFoundError extends Error implements ReducerError {
  errorCode = "ADDRESS_NOT_FOUND" as ErrorCode;
  constructor(message = "AddressNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddAddress: { AddressKnownError },

  UpdateAddress: { AddressNotFoundError },

  RemoveAddress: { AddressNotFoundError },

  SetAddressIgnored: { AddressNotFoundError },
};
