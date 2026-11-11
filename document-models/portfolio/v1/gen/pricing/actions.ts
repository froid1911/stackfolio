/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  RemovePriceOverrideInput,
  SetAssetIgnoredInput,
  SetPriceOverrideInput,
} from "../types.js";

export type SetPriceOverrideAction = Action & {
  type: "SET_PRICE_OVERRIDE";
  input: SetPriceOverrideInput;
};
export type RemovePriceOverrideAction = Action & {
  type: "REMOVE_PRICE_OVERRIDE";
  input: RemovePriceOverrideInput;
};
export type SetAssetIgnoredAction = Action & {
  type: "SET_ASSET_IGNORED";
  input: SetAssetIgnoredInput;
};

export type PortfolioPricingAction =
  | SetPriceOverrideAction
  | RemovePriceOverrideAction
  | SetAssetIgnoredAction;
