export type ErrorCode =
  | "EMPTY_IMPORT"
  | "DUPLICATE_EVENT"
  | "INVALID_AMOUNT"
  | "INVALID_INPUT";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class EmptyImportError extends Error implements ReducerError {
  errorCode = "EMPTY_IMPORT" as ErrorCode;
  constructor(message = "EmptyImportError") {
    super(message);
  }
}

export class DuplicateEventError extends Error implements ReducerError {
  errorCode = "DUPLICATE_EVENT" as ErrorCode;
  constructor(message = "DuplicateEventError") {
    super(message);
  }
}

export class InvalidAmountError extends Error implements ReducerError {
  errorCode = "INVALID_AMOUNT" as ErrorCode;
  constructor(message = "InvalidAmountError") {
    super(message);
  }
}

export class EmptyReplacementError extends Error implements ReducerError {
  errorCode = "INVALID_INPUT" as ErrorCode;
  constructor(message = "EmptyReplacementError") {
    super(message);
  }
}

export const errors = {
  ImportEvents: { EmptyImportError, DuplicateEventError, InvalidAmountError },

  ReplaceEvents: { EmptyReplacementError, InvalidAmountError },
};
