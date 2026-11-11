/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { AssetRegistryAction } from "./actions.js";
import type { AssetRegistryState as AssetRegistryGlobalState } from "./schema/types.js";

type AssetRegistryLocalState = Record<PropertyKey, never>;

type AssetRegistryPHState = PHBaseState & {
  global: AssetRegistryGlobalState;
  local: AssetRegistryLocalState;
};
type AssetRegistryDocument = PHDocument<AssetRegistryPHState>;

export * from "./schema/types.js";

export type {
  AssetRegistryAction,
  AssetRegistryDocument,
  AssetRegistryGlobalState,
  AssetRegistryLocalState,
  AssetRegistryPHState,
};
