/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  RegisterProtocolInput,
  RetireProtocolInput,
  UpdateProtocolInput,
} from "../types.js";

export type RegisterProtocolAction = Action & {
  type: "REGISTER_PROTOCOL";
  input: RegisterProtocolInput;
};
export type UpdateProtocolAction = Action & {
  type: "UPDATE_PROTOCOL";
  input: UpdateProtocolInput;
};
export type RetireProtocolAction = Action & {
  type: "RETIRE_PROTOCOL";
  input: RetireProtocolInput;
};

export type ProtocolRegistryRegistryAction =
  | RegisterProtocolAction
  | UpdateProtocolAction
  | RetireProtocolAction;
