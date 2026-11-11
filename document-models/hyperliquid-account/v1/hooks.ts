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
  HyperliquidAccountAction,
  HyperliquidAccountDocument,
} from "document-models/hyperliquid-account/v1";
import {
  assertIsHyperliquidAccountDocument,
  isHyperliquidAccountDocument,
} from "./gen/document-schema.js";

/** Hook to get a HyperliquidAccount document by its id */
export function useHyperliquidAccountDocumentById(
  documentId: string | null | undefined,
):
  | [HyperliquidAccountDocument, DocumentDispatch<HyperliquidAccountAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isHyperliquidAccountDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected HyperliquidAccount document */
export function useSelectedHyperliquidAccountDocument(): [
  HyperliquidAccountDocument,
  DocumentDispatch<HyperliquidAccountAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsHyperliquidAccountDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all HyperliquidAccount documents in the selected drive */
export function useHyperliquidAccountDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isHyperliquidAccountDocument);
}

/** Hook to get all HyperliquidAccount documents in the selected folder */
export function useHyperliquidAccountDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isHyperliquidAccountDocument);
}
