/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  RegisterAssetInput,
  RemoveAssetInput,
  SetCoingeckoIdInput,
  UpdateAssetInput,
} from "../types.js";

export type RegisterAssetAction = Action & {
  type: "REGISTER_ASSET";
  input: RegisterAssetInput;
};
export type UpdateAssetAction = Action & {
  type: "UPDATE_ASSET";
  input: UpdateAssetInput;
};
export type SetCoingeckoIdAction = Action & {
  type: "SET_COINGECKO_ID";
  input: SetCoingeckoIdInput;
};
export type RemoveAssetAction = Action & {
  type: "REMOVE_ASSET";
  input: RemoveAssetInput;
};

export type AssetRegistryRegistryAction =
  | RegisterAssetAction
  | UpdateAssetAction
  | SetCoingeckoIdAction
  | RemoveAssetAction;
