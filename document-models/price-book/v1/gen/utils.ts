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
import { priceBookUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsPriceBookDocument,
  assertIsPriceBookState,
  isPriceBookDocument,
  isPriceBookState,
} from "./document-schema.js";
import { priceBookDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  PriceBookGlobalState,
  PriceBookLocalState,
  PriceBookPHState,
} from "./types.js";

export const initialGlobalState: PriceBookGlobalState = {
  baseCurrency: "EUR",
  latest: [],
  history: [],
  status: { lastFetchAt: null, lastError: null },
};
export const initialLocalState: PriceBookLocalState = {};

export const utils: DocumentModelUtils<PriceBookPHState> = {
  fileExtension: ".prices",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, priceBookDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: priceBookUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isPriceBookState(state);
  },
  assertIsStateOfType(state) {
    return assertIsPriceBookState(state);
  },
  isDocumentOfType(document) {
    return isPriceBookDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsPriceBookDocument(document);
  },
};
