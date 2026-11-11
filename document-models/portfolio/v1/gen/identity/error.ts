export type ErrorCode = "INVALID_CURRENCY" | "CURRENCY_LOCKED";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidCurrencyError extends Error implements ReducerError {
  errorCode = "INVALID_CURRENCY" as ErrorCode;
  constructor(message = "InvalidCurrencyError") {
    super(message);
  }
}

export class CurrencyLockedError extends Error implements ReducerError {
  errorCode = "CURRENCY_LOCKED" as ErrorCode;
  constructor(message = "CurrencyLockedError") {
    super(message);
  }
}

export const errors = {
  SetPortfolioDetails: { InvalidCurrencyError, CurrencyLockedError },
};
