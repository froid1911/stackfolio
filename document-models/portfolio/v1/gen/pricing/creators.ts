/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RemovePriceOverrideInputSchema,
  SetAssetIgnoredInputSchema,
  SetPriceOverrideInputSchema,
} from "../schema/zod.js";
import type {
  RemovePriceOverrideInput,
  SetAssetIgnoredInput,
  SetPriceOverrideInput,
} from "../types.js";
import type {
  RemovePriceOverrideAction,
  SetAssetIgnoredAction,
  SetPriceOverrideAction,
} from "./actions.js";

export const setPriceOverride = (input: SetPriceOverrideInput) =>
  createAction<SetPriceOverrideAction>(
    "SET_PRICE_OVERRIDE",
    { ...input },
    undefined,
    SetPriceOverrideInputSchema,
    "global",
  );

export const removePriceOverride = (input: RemovePriceOverrideInput) =>
  createAction<RemovePriceOverrideAction>(
    "REMOVE_PRICE_OVERRIDE",
    { ...input },
    undefined,
    RemovePriceOverrideInputSchema,
    "global",
  );

export const setAssetIgnored = (input: SetAssetIgnoredInput) =>
  createAction<SetAssetIgnoredAction>(
    "SET_ASSET_IGNORED",
    { ...input },
    undefined,
    SetAssetIgnoredInputSchema,
    "global",
  );
