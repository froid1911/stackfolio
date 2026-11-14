export type ErrorCode =
  | "CURSOR_REGRESSION"
  | "BALANCE_STALE"
  | "TOKEN_BALANCES_STALE"
  | "INVALID_TOKEN_BALANCE";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class CursorRegressionError extends Error implements ReducerError {
  errorCode = "CURSOR_REGRESSION" as ErrorCode;
  constructor(message = "CursorRegressionError") {
    super(message);
  }
}

export class BalanceStaleError extends Error implements ReducerError {
  errorCode = "BALANCE_STALE" as ErrorCode;
  constructor(message = "BalanceStaleError") {
    super(message);
  }
}

export class TokenBalancesStaleError extends Error implements ReducerError {
  errorCode = "TOKEN_BALANCES_STALE" as ErrorCode;
  constructor(message = "TokenBalancesStaleError") {
    super(message);
  }
}

export class InvalidTokenBalanceError extends Error implements ReducerError {
  errorCode = "INVALID_TOKEN_BALANCE" as ErrorCode;
  constructor(message = "InvalidTokenBalanceError") {
    super(message);
  }
}

export const errors = {
  RecordScanProgress: { CursorRegressionError },

  SetNativeBalance: { BalanceStaleError },

  SetTokenBalances: { TokenBalancesStaleError, InvalidTokenBalanceError },
};
