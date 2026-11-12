export type ErrorCode = "EVENT_NOT_FOUND" | "INVALID_INPUT";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class EventNotFoundError extends Error implements ReducerError {
  errorCode = "EVENT_NOT_FOUND" as ErrorCode;
  constructor(message = "EventNotFoundError") {
    super(message);
  }
}

export class InvalidValuationError extends Error implements ReducerError {
  errorCode = "INVALID_INPUT" as ErrorCode;
  constructor(message = "InvalidValuationError") {
    super(message);
  }
}

export const errors = {
  SetEventIgnored: { EventNotFoundError },

  SetEventNotes: { EventNotFoundError },

  RetypeEvent: { EventNotFoundError },

  PinValuations: { InvalidValuationError },
};
