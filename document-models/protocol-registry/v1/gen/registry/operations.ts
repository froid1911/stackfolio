/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { ProtocolRegistryGlobalState } from "../types.js";
import type {
  RegisterProtocolAction,
  RetireProtocolAction,
  UpdateProtocolAction,
} from "./actions.js";

export interface ProtocolRegistryRegistryOperations {
  registerProtocolOperation: (
    state: ProtocolRegistryGlobalState,
    action: RegisterProtocolAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateProtocolOperation: (
    state: ProtocolRegistryGlobalState,
    action: UpdateProtocolAction,
    dispatch?: SignalDispatch,
  ) => void;
  retireProtocolOperation: (
    state: ProtocolRegistryGlobalState,
    action: RetireProtocolAction,
    dispatch?: SignalDispatch,
  ) => void;
}
