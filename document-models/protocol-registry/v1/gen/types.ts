/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { PHBaseState, PHDocument } from "document-model";
import type { ProtocolRegistryAction } from "./actions.js";
import type { ProtocolRegistryState as ProtocolRegistryGlobalState } from "./schema/types.js";

type ProtocolRegistryLocalState = Record<PropertyKey, never>;

type ProtocolRegistryPHState = PHBaseState & {
  global: ProtocolRegistryGlobalState;
  local: ProtocolRegistryLocalState;
};
type ProtocolRegistryDocument = PHDocument<ProtocolRegistryPHState>;

export * from "./schema/types.js";

export type {
  ProtocolRegistryAction,
  ProtocolRegistryDocument,
  ProtocolRegistryGlobalState,
  ProtocolRegistryLocalState,
  ProtocolRegistryPHState,
};
