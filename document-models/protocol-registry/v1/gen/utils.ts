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
import { protocolRegistryUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsProtocolRegistryDocument,
  assertIsProtocolRegistryState,
  isProtocolRegistryDocument,
  isProtocolRegistryState,
} from "./document-schema.js";
import { protocolRegistryDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  ProtocolRegistryGlobalState,
  ProtocolRegistryLocalState,
  ProtocolRegistryPHState,
} from "./types.js";

export const initialGlobalState: ProtocolRegistryGlobalState = {
  protocols: [],
};
export const initialLocalState: ProtocolRegistryLocalState = {};

export const utils: DocumentModelUtils<ProtocolRegistryPHState> = {
  fileExtension: ".prgr",
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
      protocolRegistryDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: protocolRegistryUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isProtocolRegistryState(state);
  },
  assertIsStateOfType(state) {
    return assertIsProtocolRegistryState(state);
  },
  isDocumentOfType(document) {
    return isProtocolRegistryDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsProtocolRegistryDocument(document);
  },
};
