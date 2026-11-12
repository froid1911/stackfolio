/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { portfolioDocumentType } from "./document-type.js";
import { PortfolioStateSchema } from "./schema/zod.js";
import type { PortfolioDocument, PortfolioPHState } from "./types.js";

/** Schema for validating the header object of a Portfolio document */
export const PortfolioDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(portfolioDocumentType),
});

/** Schema for validating the state object of a Portfolio document */
export const PortfolioPHStateSchema = BaseDocumentStateSchema.extend({
  global: PortfolioStateSchema(),
});

export const PortfolioDocumentSchema = z.object({
  header: PortfolioDocumentHeaderSchema,
  state: PortfolioPHStateSchema,
  initialState: PortfolioPHStateSchema,
});

/** Simple helper function to check if a state object is a Portfolio document state object */
export function isPortfolioState(state: unknown): state is PortfolioPHState {
  return PortfolioPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a Portfolio document state object */
export function assertIsPortfolioState(
  state: unknown,
): asserts state is PortfolioPHState {
  PortfolioPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a Portfolio document */
export function isPortfolioDocument(
  document: unknown,
): document is PortfolioDocument {
  return PortfolioDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a Portfolio document */
export function assertIsPortfolioDocument(
  document: unknown,
): asserts document is PortfolioDocument {
  PortfolioDocumentSchema.parse(document);
}
