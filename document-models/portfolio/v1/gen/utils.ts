/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentModelUtils, PHBaseState, Reducer } from "document-model";
import {
  baseCreateDocument,
  baseLoadFromInputVersioned,
  baseSaveToFileHandle,
  createBaseState,
} from "document-model";
import { portfolioUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsPortfolioDocument,
  assertIsPortfolioState,
  isPortfolioDocument,
  isPortfolioState,
} from "./document-schema.js";
import { portfolioDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  PortfolioGlobalState,
  PortfolioLocalState,
  PortfolioPHState,
} from "./types.js";

export const initialGlobalState: PortfolioGlobalState = {
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
};
export const initialLocalState: PortfolioLocalState = {};

export const utils: DocumentModelUtils<PortfolioPHState> = {
  fileExtension: ".folio",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, portfolioDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: portfolioUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isPortfolioState(state);
  },
  assertIsStateOfType(state) {
    return assertIsPortfolioState(state);
  },
  isDocumentOfType(document) {
    return isPortfolioDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsPortfolioDocument(document);
  },
};
