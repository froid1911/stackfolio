/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { EthStakingAction } from "./actions.js";
import type { EthStakingState as EthStakingGlobalState } from "./schema/types.js";

type EthStakingLocalState = Record<PropertyKey, never>;

type EthStakingPHState = PHBaseState & {
  global: EthStakingGlobalState;
  local: EthStakingLocalState;
};
type EthStakingDocument = PHDocument<EthStakingPHState>;

export * from "./schema/types.js";

export type {
  EthStakingAction,
  EthStakingDocument,
  EthStakingGlobalState,
  EthStakingLocalState,
  EthStakingPHState,
};
