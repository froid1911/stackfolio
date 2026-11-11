/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { assetRegistryDocumentType } from "./document-type.js";
import { AssetRegistryStateSchema } from "./schema/zod.js";
import type { AssetRegistryDocument, AssetRegistryPHState } from "./types.js";

/** Schema for validating the header object of a AssetRegistry document */
export const AssetRegistryDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(assetRegistryDocumentType),
  });

/** Schema for validating the state object of a AssetRegistry document */
export const AssetRegistryPHStateSchema = BaseDocumentStateSchema.extend({
  global: AssetRegistryStateSchema(),
});

export const AssetRegistryDocumentSchema = z.object({
  header: AssetRegistryDocumentHeaderSchema,
  state: AssetRegistryPHStateSchema,
  initialState: AssetRegistryPHStateSchema,
});

/** Simple helper function to check if a state object is a AssetRegistry document state object */
export function isAssetRegistryState(
  state: unknown,
): state is AssetRegistryPHState {
  return AssetRegistryPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a AssetRegistry document state object */
export function assertIsAssetRegistryState(
  state: unknown,
): asserts state is AssetRegistryPHState {
  AssetRegistryPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a AssetRegistry document */
export function isAssetRegistryDocument(
  document: unknown,
): document is AssetRegistryDocument {
  return AssetRegistryDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a AssetRegistry document */
export function assertIsAssetRegistryDocument(
  document: unknown,
): asserts document is AssetRegistryDocument {
  AssetRegistryDocumentSchema.parse(document);
}
