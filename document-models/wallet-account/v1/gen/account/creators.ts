/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  SetAccountDetailsInputSchema,
  SetIgnoredInputSchema,
  SetWalletXpubInputSchema,
} from "../schema/zod.js";
import type {
  SetAccountDetailsInput,
  SetIgnoredInput,
  SetWalletXpubInput,
} from "../types.js";
import type {
  SetAccountDetailsAction,
  SetIgnoredAction,
  SetWalletXpubAction,
} from "./actions.js";

export const setAccountDetails = (input: SetAccountDetailsInput) =>
  createAction<SetAccountDetailsAction>(
    "SET_ACCOUNT_DETAILS",
    { ...input },
    undefined,
    SetAccountDetailsInputSchema,
    "global",
  );

export const setIgnored = (input: SetIgnoredInput) =>
  createAction<SetIgnoredAction>(
    "SET_IGNORED",
    { ...input },
    undefined,
    SetIgnoredInputSchema,
    "global",
  );

export const setWalletXpub = (input: SetWalletXpubInput) =>
  createAction<SetWalletXpubAction>(
    "SET_WALLET_XPUB",
    { ...input },
    undefined,
    SetWalletXpubInputSchema,
    "global",
  );
