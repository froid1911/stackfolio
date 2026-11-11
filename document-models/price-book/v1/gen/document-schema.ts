/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { priceBookDocumentType } from "./document-type.js";
import { PriceBookStateSchema } from "./schema/zod.js";
import type { PriceBookDocument, PriceBookPHState } from "./types.js";

/** Schema for validating the header object of a PriceBook document */
export const PriceBookDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(priceBookDocumentType),
});

/** Schema for validating the state object of a PriceBook document */
export const PriceBookPHStateSchema = BaseDocumentStateSchema.extend({
  global: PriceBookStateSchema(),
});

export const PriceBookDocumentSchema = z.object({
  header: PriceBookDocumentHeaderSchema,
  state: PriceBookPHStateSchema,
  initialState: PriceBookPHStateSchema,
});

/** Simple helper function to check if a state object is a PriceBook document state object */
export function isPriceBookState(state: unknown): state is PriceBookPHState {
  return PriceBookPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a PriceBook document state object */
export function assertIsPriceBookState(
  state: unknown,
): asserts state is PriceBookPHState {
  PriceBookPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a PriceBook document */
export function isPriceBookDocument(
  document: unknown,
): document is PriceBookDocument {
  return PriceBookDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a PriceBook document */
export function assertIsPriceBookDocument(
  document: unknown,
): asserts document is PriceBookDocument {
  PriceBookDocumentSchema.parse(document);
}
