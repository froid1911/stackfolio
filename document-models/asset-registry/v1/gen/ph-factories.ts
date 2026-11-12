/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating AssetRegistryDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  AssetRegistryDocument,
  AssetRegistryGlobalState,
  AssetRegistryLocalState,
  AssetRegistryPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): AssetRegistryGlobalState {
  return { assets: [] };
}

export function defaultLocalState(): AssetRegistryLocalState {
  return {};
}

export function defaultPHState(): AssetRegistryPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<AssetRegistryGlobalState>,
): AssetRegistryGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<AssetRegistryLocalState>,
): AssetRegistryLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as AssetRegistryLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<AssetRegistryGlobalState>,
  localState?: Partial<AssetRegistryLocalState>,
): AssetRegistryPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a AssetRegistryDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createAssetRegistryDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<AssetRegistryGlobalState>;
    local?: Partial<AssetRegistryLocalState>;
  }>,
): AssetRegistryDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
