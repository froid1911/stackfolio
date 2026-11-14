/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 * Factory methods for creating PortfolioDocument instances
 */
import type { PHAuthState, PHBaseState, PHDocumentState } from "document-model";
import { createBaseState, defaultBaseState } from "document-model";
import type {
  PortfolioDocument,
  PortfolioGlobalState,
  PortfolioLocalState,
  PortfolioPHState,
} from "./types.js";
import { utils } from "./utils.js";

export function defaultGlobalState(): PortfolioGlobalState {
  return {
    name: null,
    baseCurrency: "EUR",
    addresses: [],
    priceOverrides: [],
    ignoredAssets: [],
    autoSnapshot: { enabled: false, intervalHours: 24 },
    snapshots: [],
    positions: [],
    resources: null,
    lastCheck: null,
    grant: null,
    bundles: [],
    categoryRules: [],
    categoryOverrides: [],
  };
}

export function defaultLocalState(): PortfolioLocalState {
  return {};
}

export function defaultPHState(): PortfolioPHState {
  return {
    ...defaultBaseState(),
    global: defaultGlobalState(),
    local: defaultLocalState(),
  };
}

export function createGlobalState(
  state?: Partial<PortfolioGlobalState>,
): PortfolioGlobalState {
  return {
    ...defaultGlobalState(),
    ...(state || {}),
  };
}

export function createLocalState(
  state?: Partial<PortfolioLocalState>,
): PortfolioLocalState {
  return {
    ...defaultLocalState(),
    ...(state || {}),
  } as PortfolioLocalState;
}

export function createState(
  baseState?: Partial<PHBaseState>,
  globalState?: Partial<PortfolioGlobalState>,
  localState?: Partial<PortfolioLocalState>,
): PortfolioPHState {
  return {
    ...createBaseState(baseState?.auth, baseState?.document),
    global: createGlobalState(globalState),
    local: createLocalState(localState),
  };
}

/**
 * Creates a PortfolioDocument with custom global and local state
 * This properly handles the PHBaseState requirements while allowing
 * document-specific state to be set.
 */
export function createPortfolioDocument(
  state?: Partial<{
    auth?: Partial<PHAuthState>;
    document?: Partial<PHDocumentState>;
    global?: Partial<PortfolioGlobalState>;
    local?: Partial<PortfolioLocalState>;
  }>,
): PortfolioDocument {
  const document = utils.createDocument(
    createState(
      createBaseState(state?.auth, { version: 1, ...state?.document }),
      state?.global,
      state?.local,
    ),
  );

  return document;
}
