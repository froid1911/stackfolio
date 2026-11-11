/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { hyperliquidAccountDocumentType } from "./document-type.js";
import { HyperliquidAccountStateSchema } from "./schema/zod.js";
import type {
  HyperliquidAccountDocument,
  HyperliquidAccountPHState,
} from "./types.js";

/** Schema for validating the header object of a HyperliquidAccount document */
export const HyperliquidAccountDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(hyperliquidAccountDocumentType),
  });

/** Schema for validating the state object of a HyperliquidAccount document */
export const HyperliquidAccountPHStateSchema = BaseDocumentStateSchema.extend({
  global: HyperliquidAccountStateSchema(),
});

export const HyperliquidAccountDocumentSchema = z.object({
  header: HyperliquidAccountDocumentHeaderSchema,
  state: HyperliquidAccountPHStateSchema,
  initialState: HyperliquidAccountPHStateSchema,
});

/** Simple helper function to check if a state object is a HyperliquidAccount document state object */
export function isHyperliquidAccountState(
  state: unknown,
): state is HyperliquidAccountPHState {
  return HyperliquidAccountPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a HyperliquidAccount document state object */
export function assertIsHyperliquidAccountState(
  state: unknown,
): asserts state is HyperliquidAccountPHState {
  HyperliquidAccountPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a HyperliquidAccount document */
export function isHyperliquidAccountDocument(
  document: unknown,
): document is HyperliquidAccountDocument {
  return HyperliquidAccountDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a HyperliquidAccount document */
export function assertIsHyperliquidAccountDocument(
  document: unknown,
): asserts document is HyperliquidAccountDocument {
  HyperliquidAccountDocumentSchema.parse(document);
}
