/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { ethStakingDocumentType } from "./document-type.js";
import { EthStakingStateSchema } from "./schema/zod.js";
import type { EthStakingDocument, EthStakingPHState } from "./types.js";

/** Schema for validating the header object of a EthStaking document */
export const EthStakingDocumentHeaderSchema = BaseDocumentHeaderSchema.extend({
  documentType: z.literal(ethStakingDocumentType),
});

/** Schema for validating the state object of a EthStaking document */
export const EthStakingPHStateSchema = BaseDocumentStateSchema.extend({
  global: EthStakingStateSchema(),
});

export const EthStakingDocumentSchema = z.object({
  header: EthStakingDocumentHeaderSchema,
  state: EthStakingPHStateSchema,
  initialState: EthStakingPHStateSchema,
});

/** Simple helper function to check if a state object is a EthStaking document state object */
export function isEthStakingState(state: unknown): state is EthStakingPHState {
  return EthStakingPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a EthStaking document state object */
export function assertIsEthStakingState(
  state: unknown,
): asserts state is EthStakingPHState {
  EthStakingPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a EthStaking document */
export function isEthStakingDocument(
  document: unknown,
): document is EthStakingDocument {
  return EthStakingDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a EthStaking document */
export function assertIsEthStakingDocument(
  document: unknown,
): asserts document is EthStakingDocument {
  EthStakingDocumentSchema.parse(document);
}
