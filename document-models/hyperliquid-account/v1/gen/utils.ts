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
import { hyperliquidAccountUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsHyperliquidAccountDocument,
  assertIsHyperliquidAccountState,
  isHyperliquidAccountDocument,
  isHyperliquidAccountState,
} from "./document-schema.js";
import { hyperliquidAccountDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  HyperliquidAccountGlobalState,
  HyperliquidAccountLocalState,
  HyperliquidAccountPHState,
} from "./types.js";

export const initialGlobalState: HyperliquidAccountGlobalState = {
  accounts: [],
};
export const initialLocalState: HyperliquidAccountLocalState = {};

export const utils: DocumentModelUtils<HyperliquidAccountPHState> = {
  fileExtension: ".hlac",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(
      utils.createState,
      state,
      hyperliquidAccountDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: hyperliquidAccountUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isHyperliquidAccountState(state);
  },
  assertIsStateOfType(state) {
    return assertIsHyperliquidAccountState(state);
  },
  isDocumentOfType(document) {
    return isHyperliquidAccountDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsHyperliquidAccountDocument(document);
  },
};
