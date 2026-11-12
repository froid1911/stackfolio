/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating ProtocolRegistryDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  ProtocolRegistryDocument,
  ProtocolRegistryGlobalState,
  ProtocolRegistryLocalState,
  ProtocolRegistryPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): ProtocolRegistryGlobalState {
  return { protocols: [] };
}

export function defaultLocalState(): ProtocolRegistryLocalState {
  return {};
}

export function defaultPHState(): ProtocolRegistryPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<ProtocolRegistryGlobalState>,
): ProtocolRegistryGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<ProtocolRegistryLocalState>,
): ProtocolRegistryLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as ProtocolRegistryLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<ProtocolRegistryGlobalState>,
  localState?: Partial<ProtocolRegistryLocalState>,
): ProtocolRegistryPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a ProtocolRegistryDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createProtocolRegistryDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<ProtocolRegistryGlobalState>;
    local?: Partial<ProtocolRegistryLocalState>;
  }>,
): ProtocolRegistryDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
