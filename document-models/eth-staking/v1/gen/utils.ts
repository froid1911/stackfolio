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
import { ethStakingUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsEthStakingDocument,
  assertIsEthStakingState,
  isEthStakingDocument,
  isEthStakingState,
} from "./document-schema.js";
import { ethStakingDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  EthStakingGlobalState,
  EthStakingLocalState,
  EthStakingPHState,
} from "./types.js";

export const initialGlobalState: EthStakingGlobalState = {
  validators: [],
  balanceHistory: [],
  withdrawals: [],
  cursor: null,
};
export const initialLocalState: EthStakingLocalState = {};

export const utils: DocumentModelUtils<EthStakingPHState> = {
  fileExtension: ".staking",
  createState(state) {
    return {
      ...createBaseState(state?.auth, { version: 1, ...state?.document }),
      global: { ...initialGlobalState, ...state?.global },
      local: { ...initialLocalState, ...state?.local },
    };
  },
  createDocument(state) {
    return baseCreateDocument(utils.createState, state, ethStakingDocumentType);
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: ethStakingUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isEthStakingState(state);
  },
  assertIsStateOfType(state) {
    return assertIsEthStakingState(state);
  },
  isDocumentOfType(document) {
    return isEthStakingDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsEthStakingDocument(document);
  },
};
