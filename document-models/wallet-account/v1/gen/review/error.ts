export type ErrorCode = "EVENT_NOT_FOUND";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class EventNotFoundError extends Error implements ReducerError {
  errorCode = "EVENT_NOT_FOUND" as ErrorCode;
  constructor(message = "EventNotFoundError") {
    super(message);
  }
}

export const errors = {
  SetEventIgnored: { EventNotFoundError },

  SetEventNotes: { EventNotFoundError },

  RetypeEvent: { EventNotFoundError },
};
