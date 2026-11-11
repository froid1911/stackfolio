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
import { assetRegistryUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsAssetRegistryDocument,
  assertIsAssetRegistryState,
  isAssetRegistryDocument,
  isAssetRegistryState,
} from "./document-schema.js";
import { assetRegistryDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  AssetRegistryGlobalState,
  AssetRegistryLocalState,
  AssetRegistryPHState,
} from "./types.js";

export const initialGlobalState: AssetRegistryGlobalState = { assets: [] };
export const initialLocalState: AssetRegistryLocalState = {};

export const utils: DocumentModelUtils<AssetRegistryPHState> = {
  fileExtension: ".asr",
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
      assetRegistryDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: assetRegistryUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isAssetRegistryState(state);
  },
  assertIsStateOfType(state) {
    return assertIsAssetRegistryState(state);
  },
  isDocumentOfType(document) {
    return isAssetRegistryDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsAssetRegistryDocument(document);
  },
};
