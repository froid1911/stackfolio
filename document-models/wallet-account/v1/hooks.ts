/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import {
  useDocumentById,
  useDocumentsInSelectedDrive,
  useDocumentsInSelectedFolder,
  useSelectedDocument,
} from "@powerhousedao/reactor-browser";
import type {
  WalletAccountAction,
  WalletAccountDocument,
} from "document-models/wallet-account/v1";
import {
  assertIsWalletAccountDocument,
  isWalletAccountDocument,
} from "./gen/document-schema.js";

/** Hook to get a WalletAccount document by its id */
export function useWalletAccountDocumentById(
  documentId: string | null | undefined,
):
  | [WalletAccountDocument, DocumentDispatch<WalletAccountAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isWalletAccountDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected WalletAccount document */
export function useSelectedWalletAccountDocument(): [
  WalletAccountDocument,
  DocumentDispatch<WalletAccountAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsWalletAccountDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all WalletAccount documents in the selected drive */
export function useWalletAccountDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isWalletAccountDocument);
}

/** Hook to get all WalletAccount documents in the selected folder */
export function useWalletAccountDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isWalletAccountDocument);
}
