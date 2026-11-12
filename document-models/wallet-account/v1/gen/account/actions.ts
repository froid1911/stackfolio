/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  SetAccountDetailsInput,
  SetIgnoredInput,
  SetWalletXpubInput,
} from "../types.js";

export type SetAccountDetailsAction = Action & {
  type: "SET_ACCOUNT_DETAILS";
  input: SetAccountDetailsInput;
};
export type SetIgnoredAction = Action & {
  type: "SET_IGNORED";
  input: SetIgnoredInput;
};
export type SetWalletXpubAction = Action & {
  type: "SET_WALLET_XPUB";
  input: SetWalletXpubInput;
};

export type WalletAccountAccountAction =
  | SetAccountDetailsAction
  | SetIgnoredAction
  | SetWalletXpubAction;
