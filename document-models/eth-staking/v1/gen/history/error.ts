export type ErrorCode = "INVALID_AMOUNT" | "CURSOR_REGRESSION";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidAmountError extends Error implements ReducerError {
  errorCode = "INVALID_AMOUNT" as ErrorCode;
  constructor(message = "InvalidAmountError") {
    super(message);
  }
}

export class CursorRegressionError extends Error implements ReducerError {
  errorCode = "CURSOR_REGRESSION" as ErrorCode;
  constructor(message = "CursorRegressionError") {
    super(message);
  }
}

export const errors = {
  RecordWithdrawals: { InvalidAmountError },

  RecordStakeScanProgress: { CursorRegressionError },
};
