/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type { UpsertValidatorsInput } from "../types.js";

export type UpsertValidatorsAction = Action & {
  type: "UPSERT_VALIDATORS";
  input: UpsertValidatorsInput;
};

export type EthStakingValidatorsAction = UpsertValidatorsAction;
