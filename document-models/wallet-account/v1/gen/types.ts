/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { WalletAccountAction } from "./actions.js";
import type { WalletAccountState as WalletAccountGlobalState } from "./schema/types.js";

type WalletAccountLocalState = Record<PropertyKey, never>;

type WalletAccountPHState = PHBaseState & {
  global: WalletAccountGlobalState;
  local: WalletAccountLocalState;
};
type WalletAccountDocument = PHDocument<WalletAccountPHState>;

export * from "./schema/types.js";

export type {
  WalletAccountAction,
  WalletAccountDocument,
  WalletAccountGlobalState,
  WalletAccountLocalState,
  WalletAccountPHState,
};
