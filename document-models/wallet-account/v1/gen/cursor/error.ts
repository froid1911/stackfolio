export type ErrorCode = "CURSOR_REGRESSION" | "BALANCE_STALE";

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

export const errors = {
  RecordScanProgress: { CursorRegressionError },

  SetNativeBalance: { BalanceStaleError },
};
