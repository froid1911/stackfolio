/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  PinValuationsInput,
  RetypeEventInput,
  SetEventIgnoredInput,
  SetEventNotesInput,
} from "../types.js";

export type SetEventIgnoredAction = Action & {
  type: "SET_EVENT_IGNORED";
  input: SetEventIgnoredInput;
};
export type SetEventNotesAction = Action & {
  type: "SET_EVENT_NOTES";
  input: SetEventNotesInput;
};
export type RetypeEventAction = Action & {
  type: "RETYPE_EVENT";
  input: RetypeEventInput;
};
export type PinValuationsAction = Action & {
  type: "PIN_VALUATIONS";
  input: PinValuationsInput;
};

export type WalletAccountReviewAction =
  | SetEventIgnoredAction
  | SetEventNotesAction
  | RetypeEventAction
  | PinValuationsAction;
