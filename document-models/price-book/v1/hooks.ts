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
  PriceBookAction,
  PriceBookDocument,
} from "document-models/price-book/v1";
import {
  assertIsPriceBookDocument,
  isPriceBookDocument,
} from "./gen/document-schema.js";

/** Hook to get a PriceBook document by its id */
export function usePriceBookDocumentById(
  documentId: string | null | undefined,
):
  | [PriceBookDocument, DocumentDispatch<PriceBookAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isPriceBookDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected PriceBook document */
export function useSelectedPriceBookDocument(): [
  PriceBookDocument,
  DocumentDispatch<PriceBookAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsPriceBookDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all PriceBook documents in the selected drive */
export function usePriceBookDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isPriceBookDocument);
}

/** Hook to get all PriceBook documents in the selected folder */
export function usePriceBookDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isPriceBookDocument);
}
