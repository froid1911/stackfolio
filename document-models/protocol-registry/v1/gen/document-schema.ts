/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { protocolRegistryDocumentType } from "./document-type.js";
import { ProtocolRegistryStateSchema } from "./schema/zod.js";
import type {
  ProtocolRegistryDocument,
  ProtocolRegistryPHState,
} from "./types.js";

/** Schema for validating the header object of a ProtocolRegistry document */
export const ProtocolRegistryDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(protocolRegistryDocumentType),
  });

/** Schema for validating the state object of a ProtocolRegistry document */
export const ProtocolRegistryPHStateSchema = BaseDocumentStateSchema.extend({
  global: ProtocolRegistryStateSchema(),
});

export const ProtocolRegistryDocumentSchema = z.object({
  header: ProtocolRegistryDocumentHeaderSchema,
  state: ProtocolRegistryPHStateSchema,
  initialState: ProtocolRegistryPHStateSchema,
});

/** Simple helper function to check if a state object is a ProtocolRegistry document state object */
export function isProtocolRegistryState(
  state: unknown,
): state is ProtocolRegistryPHState {
  return ProtocolRegistryPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a ProtocolRegistry document state object */
export function assertIsProtocolRegistryState(
  state: unknown,
): asserts state is ProtocolRegistryPHState {
  ProtocolRegistryPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a ProtocolRegistry document */
export function isProtocolRegistryDocument(
  document: unknown,
): document is ProtocolRegistryDocument {
  return ProtocolRegistryDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a ProtocolRegistry document */
export function assertIsProtocolRegistryDocument(
  document: unknown,
): asserts document is ProtocolRegistryDocument {
  ProtocolRegistryDocumentSchema.parse(document);
}
