/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating HyperliquidAccountDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  HyperliquidAccountDocument,
  HyperliquidAccountGlobalState,
  HyperliquidAccountLocalState,
  HyperliquidAccountPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): HyperliquidAccountGlobalState {
  return { accounts: [] };
}

export function defaultLocalState(): HyperliquidAccountLocalState {
  return {};
}

export function defaultPHState(): HyperliquidAccountPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<HyperliquidAccountGlobalState>,
): HyperliquidAccountGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<HyperliquidAccountLocalState>,
): HyperliquidAccountLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as HyperliquidAccountLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<HyperliquidAccountGlobalState>,
  localState?: Partial<HyperliquidAccountLocalState>,
): HyperliquidAccountPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a HyperliquidAccountDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createHyperliquidAccountDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<HyperliquidAccountGlobalState>;
    local?: Partial<HyperliquidAccountLocalState>;
  }>,
): HyperliquidAccountDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
