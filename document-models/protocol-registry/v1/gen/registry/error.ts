export type ErrorCode = "INVALID_INPUT" | "ENTITY_NOT_FOUND";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class InvalidInputError extends Error implements ReducerError {
  errorCode = "INVALID_INPUT" as ErrorCode;
  constructor(message = "InvalidInputError") {
    super(message);
  }
}

export class EntityNotFoundError extends Error implements ReducerError {
  errorCode = "ENTITY_NOT_FOUND" as ErrorCode;
  constructor(message = "EntityNotFoundError") {
    super(message);
  }
}

export const errors = {
  RegisterProtocol: { InvalidInputError },

  UpdateProtocol: { EntityNotFoundError },

  RetireProtocol: { EntityNotFoundError },
};
