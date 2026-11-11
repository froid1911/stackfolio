/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { PortfolioAction } from "./actions.js";
import type { PortfolioState as PortfolioGlobalState } from "./schema/types.js";

type PortfolioLocalState = Record<PropertyKey, never>;

type PortfolioPHState = PHBaseState & {
  global: PortfolioGlobalState;
  local: PortfolioLocalState;
};
type PortfolioDocument = PHDocument<PortfolioPHState>;

export * from "./schema/types.js";

export type {
  PortfolioAction,
  PortfolioDocument,
  PortfolioGlobalState,
  PortfolioLocalState,
  PortfolioPHState,
};
