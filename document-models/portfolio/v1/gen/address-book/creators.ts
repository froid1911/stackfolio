/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddAddressInputSchema,
  RemoveAddressInputSchema,
  SetAddressIgnoredInputSchema,
  UpdateAddressInputSchema,
} from "../schema/zod.js";
import type {
  AddAddressInput,
  RemoveAddressInput,
  SetAddressIgnoredInput,
  UpdateAddressInput,
} from "../types.js";
import type {
  AddAddressAction,
  RemoveAddressAction,
  SetAddressIgnoredAction,
  UpdateAddressAction,
} from "./actions.js";

export const addAddress = (input: AddAddressInput) =>
  createAction<AddAddressAction>(
    "ADD_ADDRESS",
    { ...input },
    undefined,
    AddAddressInputSchema,
    "global",
  );

export const updateAddress = (input: UpdateAddressInput) =>
  createAction<UpdateAddressAction>(
    "UPDATE_ADDRESS",
    { ...input },
    undefined,
    UpdateAddressInputSchema,
    "global",
  );

export const removeAddress = (input: RemoveAddressInput) =>
  createAction<RemoveAddressAction>(
    "REMOVE_ADDRESS",
    { ...input },
    undefined,
    RemoveAddressInputSchema,
    "global",
  );

export const setAddressIgnored = (input: SetAddressIgnoredInput) =>
  createAction<SetAddressIgnoredAction>(
    "SET_ADDRESS_IGNORED",
    { ...input },
    undefined,
    SetAddressIgnoredInputSchema,
    "global",
  );
