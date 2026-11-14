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
import { walletAccountUpgradeManifest } from "../../upgrades/upgrade-manifest.js";
import {
  assertIsWalletAccountDocument,
  assertIsWalletAccountState,
  isWalletAccountDocument,
  isWalletAccountState,
} from "./document-schema.js";
import { walletAccountDocumentType } from "./document-type.js";
import { reducer } from "./reducer.js";
import type {
  WalletAccountGlobalState,
  WalletAccountLocalState,
  WalletAccountPHState,
} from "./types.js";

export const initialGlobalState: WalletAccountGlobalState = {
  address: "",
  chainId: 0,
  label: null,
  ignored: false,
  ledger: [],
  cursor: null,
  backfill: null,
  redecode: null,
  nativeBalance: null,
  bitcoinXpub: null,
  ensNames: [],
  tokenBalances: null,
};
export const initialLocalState: WalletAccountLocalState = {};

export const utils: DocumentModelUtils<WalletAccountPHState> = {
  fileExtension: ".wallet",
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
      walletAccountDocumentType,
    );
  },
  saveToFileHandle(document, input) {
    return baseSaveToFileHandle(document, input);
  },
  loadFromInput(input) {
    return baseLoadFromInputVersioned(input, {
      reducers: { 1: reducer as unknown as Reducer<PHBaseState> },
      upgradeManifest: walletAccountUpgradeManifest,
    });
  },
  isStateOfType(state) {
    return isWalletAccountState(state);
  },
  assertIsStateOfType(state) {
    return assertIsWalletAccountState(state);
  },
  isDocumentOfType(document) {
    return isWalletAccountDocument(document);
  },
  assertIsDocumentOfType(document) {
    return assertIsWalletAccountDocument(document);
  },
};
