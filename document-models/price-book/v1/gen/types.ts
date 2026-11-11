/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { PriceBookAction } from "./actions.js";
import type { PriceBookState as PriceBookGlobalState } from "./schema/types.js";

type PriceBookLocalState = Record<PropertyKey, never>;

type PriceBookPHState = PHBaseState & {
  global: PriceBookGlobalState;
  local: PriceBookLocalState;
};
type PriceBookDocument = PHDocument<PriceBookPHState>;

export * from "./schema/types.js";

export type {
  PriceBookAction,
  PriceBookDocument,
  PriceBookGlobalState,
  PriceBookLocalState,
  PriceBookPHState,
};
