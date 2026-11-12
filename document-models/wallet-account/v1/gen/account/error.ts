export type ErrorCode = "INVALID_INPUT";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidInputError extends Error implements ReducerError {
  errorCode = "INVALID_INPUT" as ErrorCode;
  constructor(message = "InvalidInputError") {
    super(message);
  }
}

export const errors = {
  SetWalletXpub: { InvalidInputError },
};
