/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EthStakingHistoryAction } from "./history/actions.js";
import type { EthStakingValidatorsAction } from "./validators/actions.js";

export * from "./history/actions.js";
export * from "./validators/actions.js";

export type EthStakingAction =
  | EthStakingValidatorsAction
  | EthStakingHistoryAction;
