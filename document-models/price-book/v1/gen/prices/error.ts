export type ErrorCode = "EMPTY_RECORD" | "INVALID_AMOUNT" | "INVALID_CURRENCY";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class EmptyRecordError extends Error implements ReducerError {
  errorCode = "EMPTY_RECORD" as ErrorCode;
  constructor(message = "EmptyRecordError") {
    super(message);
  }
}

export class InvalidAmountError extends Error implements ReducerError {
  errorCode = "INVALID_AMOUNT" as ErrorCode;
  constructor(message = "InvalidAmountError") {
    super(message);
  }
}

export class InvalidCurrencyError extends Error implements ReducerError {
  errorCode = "INVALID_CURRENCY" as ErrorCode;
  constructor(message = "InvalidCurrencyError") {
    super(message);
  }
}

export const errors = {
  RecordPrices: { EmptyRecordError, InvalidAmountError },

  SetBaseCurrency: { InvalidCurrencyError },
};
