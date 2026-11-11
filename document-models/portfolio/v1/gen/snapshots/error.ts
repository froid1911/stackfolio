export type ErrorCode =
  | "EMPTY_SNAPSHOT"
  | "INVALID_AMOUNT"
  | "SNAPSHOT_NOT_FOUND";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class SnapshotEmptyError extends Error implements ReducerError {
  errorCode = "EMPTY_SNAPSHOT" as ErrorCode;
  constructor(message = "SnapshotEmptyError") {
    super(message);
  }
}

export class InvalidAmountError extends Error implements ReducerError {
  errorCode = "INVALID_AMOUNT" as ErrorCode;
  constructor(message = "InvalidAmountError") {
    super(message);
  }
}

export class SnapshotNotFoundError extends Error implements ReducerError {
  errorCode = "SNAPSHOT_NOT_FOUND" as ErrorCode;
  constructor(message = "SnapshotNotFoundError") {
    super(message);
  }
}

export const errors = {
  TakeSnapshot: { SnapshotEmptyError, InvalidAmountError },

  DeleteSnapshot: { SnapshotNotFoundError },
};
