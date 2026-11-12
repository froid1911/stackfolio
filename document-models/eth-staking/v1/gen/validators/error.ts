export type ErrorCode = "VALIDATOR_CONFLICT";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class ValidatorConflictError extends Error implements ReducerError {
  errorCode = "VALIDATOR_CONFLICT" as ErrorCode;
  constructor(message = "ValidatorConflictError") {
    super(message);
  }
}

export const errors = {
  UpsertValidators: { ValidatorConflictError },
};
