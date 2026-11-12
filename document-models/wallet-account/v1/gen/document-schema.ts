/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import {
  BaseDocumentHeaderSchema,
  BaseDocumentStateSchema,
} from "document-model";
import { z } from "zod";
import { walletAccountDocumentType } from "./document-type.js";
import { WalletAccountStateSchema } from "./schema/zod.js";
import type { WalletAccountDocument, WalletAccountPHState } from "./types.js";

/** Schema for validating the header object of a WalletAccount document */
export const WalletAccountDocumentHeaderSchema =
  BaseDocumentHeaderSchema.extend({
    documentType: z.literal(walletAccountDocumentType),
  });

/** Schema for validating the state object of a WalletAccount document */
export const WalletAccountPHStateSchema = BaseDocumentStateSchema.extend({
  global: WalletAccountStateSchema(),
});

export const WalletAccountDocumentSchema = z.object({
  header: WalletAccountDocumentHeaderSchema,
  state: WalletAccountPHStateSchema,
  initialState: WalletAccountPHStateSchema,
});

/** Simple helper function to check if a state object is a WalletAccount document state object */
export function isWalletAccountState(
  state: unknown,
): state is WalletAccountPHState {
  return WalletAccountPHStateSchema.safeParse(state).success;
}

/** Simple helper function to assert that a document state object is a WalletAccount document state object */
export function assertIsWalletAccountState(
  state: unknown,
): asserts state is WalletAccountPHState {
  WalletAccountPHStateSchema.parse(state);
}

/** Simple helper function to check if a document is a WalletAccount document */
export function isWalletAccountDocument(
  document: unknown,
): document is WalletAccountDocument {
  return WalletAccountDocumentSchema.safeParse(document).success;
}

/** Simple helper function to assert that a document is a WalletAccount document */
export function assertIsWalletAccountDocument(
  document: unknown,
): asserts document is WalletAccountDocument {
  WalletAccountDocumentSchema.parse(document);
}
