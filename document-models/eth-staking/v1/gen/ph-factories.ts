/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating EthStakingDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  EthStakingDocument,
  EthStakingGlobalState,
  EthStakingLocalState,
  EthStakingPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): EthStakingGlobalState {
  return { validators: [], balanceHistory: [], withdrawals: [], cursor: null };
}

export function defaultLocalState(): EthStakingLocalState {
  return {};
}

export function defaultPHState(): EthStakingPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<EthStakingGlobalState>,
): EthStakingGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<EthStakingLocalState>,
): EthStakingLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as EthStakingLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<EthStakingGlobalState>,
  localState?: Partial<EthStakingLocalState>,
): EthStakingPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a EthStakingDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createEthStakingDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<EthStakingGlobalState>;
    local?: Partial<EthStakingLocalState>;
  }>,
): EthStakingDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
