/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { HyperliquidAccountAction } from "./actions.js";
import type { HyperliquidAccountState as HyperliquidAccountGlobalState } from "./schema/types.js";

type HyperliquidAccountLocalState = Record<PropertyKey, never>;

type HyperliquidAccountPHState = PHBaseState & {
  global: HyperliquidAccountGlobalState;
  local: HyperliquidAccountLocalState;
};
type HyperliquidAccountDocument = PHDocument<HyperliquidAccountPHState>;

export * from "./schema/types.js";

export type {
  HyperliquidAccountAction,
  HyperliquidAccountDocument,
  HyperliquidAccountGlobalState,
  HyperliquidAccountLocalState,
  HyperliquidAccountPHState,
};
