/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { AssetRegistryGlobalState } from "../types.js";
import type {
  RegisterAssetAction,
  RemoveAssetAction,
  SetCoingeckoIdAction,
  UpdateAssetAction,
} from "./actions.js";

export interface AssetRegistryRegistryOperations {
  registerAssetOperation: (
    state: AssetRegistryGlobalState,
    action: RegisterAssetAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateAssetOperation: (
    state: AssetRegistryGlobalState,
    action: UpdateAssetAction,
    dispatch?: SignalDispatch,
  ) => void;
  setCoingeckoIdOperation: (
    state: AssetRegistryGlobalState,
    action: SetCoingeckoIdAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeAssetOperation: (
    state: AssetRegistryGlobalState,
    action: RemoveAssetAction,
    dispatch?: SignalDispatch,
  ) => void;
}
