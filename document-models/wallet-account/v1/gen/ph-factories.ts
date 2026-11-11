/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating WalletAccountDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  WalletAccountDocument,
  WalletAccountGlobalState,
  WalletAccountLocalState,
  WalletAccountPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): WalletAccountGlobalState {
  return {
    address: "",
    chainId: 0,
    label: null,
    ignored: false,
    ledger: [],
    cursor: null,
    backfill: null,
    nativeBalance: null,
  };
}

export function defaultLocalState(): WalletAccountLocalState {
  return {};
}

export function defaultPHState(): WalletAccountPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<WalletAccountGlobalState>,
): WalletAccountGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<WalletAccountLocalState>,
): WalletAccountLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as WalletAccountLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<WalletAccountGlobalState>,
  localState?: Partial<WalletAccountLocalState>,
): WalletAccountPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a WalletAccountDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createWalletAccountDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<WalletAccountGlobalState>;
    local?: Partial<WalletAccountLocalState>;
  }>,
): WalletAccountDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
