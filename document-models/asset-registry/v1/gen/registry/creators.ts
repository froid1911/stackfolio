/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RegisterAssetInputSchema,
  RemoveAssetInputSchema,
  SetCoingeckoIdInputSchema,
  UpdateAssetInputSchema,
} from "../schema/zod.js";
import type {
  RegisterAssetInput,
  RemoveAssetInput,
  SetCoingeckoIdInput,
  UpdateAssetInput,
} from "../types.js";
import type {
  RegisterAssetAction,
  RemoveAssetAction,
  SetCoingeckoIdAction,
  UpdateAssetAction,
} from "./actions.js";

export const registerAsset = (input: RegisterAssetInput) =>
  createAction<RegisterAssetAction>(
    "REGISTER_ASSET",
    { ...input },
    undefined,
    RegisterAssetInputSchema,
    "global",
  );

export const updateAsset = (input: UpdateAssetInput) =>
  createAction<UpdateAssetAction>(
    "UPDATE_ASSET",
    { ...input },
    undefined,
    UpdateAssetInputSchema,
    "global",
  );

export const setCoingeckoId = (input: SetCoingeckoIdInput) =>
  createAction<SetCoingeckoIdAction>(
    "SET_COINGECKO_ID",
    { ...input },
    undefined,
    SetCoingeckoIdInputSchema,
    "global",
  );

export const removeAsset = (input: RemoveAssetInput) =>
  createAction<RemoveAssetAction>(
    "REMOVE_ASSET",
    { ...input },
    undefined,
    RemoveAssetInputSchema,
    "global",
  );
