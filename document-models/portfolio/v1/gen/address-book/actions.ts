/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddAddressInput,
  RemoveAddressInput,
  SetAddressIgnoredInput,
  UpdateAddressInput,
} from "../types.js";

export type AddAddressAction = Action & {
  type: "ADD_ADDRESS";
  input: AddAddressInput;
};
export type UpdateAddressAction = Action & {
  type: "UPDATE_ADDRESS";
  input: UpdateAddressInput;
};
export type RemoveAddressAction = Action & {
  type: "REMOVE_ADDRESS";
  input: RemoveAddressInput;
};
export type SetAddressIgnoredAction = Action & {
  type: "SET_ADDRESS_IGNORED";
  input: SetAddressIgnoredInput;
};

export type PortfolioAddressBookAction =
  | AddAddressAction
  | UpdateAddressAction
  | RemoveAddressAction
  | SetAddressIgnoredAction;
