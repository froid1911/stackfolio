export type ErrorCode = "INVALID_AMOUNT";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidAmountError extends Error implements ReducerError {
  errorCode = "INVALID_AMOUNT" as ErrorCode;
  constructor(message = "InvalidAmountError") {
    super(message);
  }
}

export const errors = {
  SetPriceOverride: { InvalidAmountError },
};
