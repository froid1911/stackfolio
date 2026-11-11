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
  PortfolioAction,
  PortfolioDocument,
} from "document-models/portfolio/v1";
import {
  assertIsPortfolioDocument,
  isPortfolioDocument,
} from "./gen/document-schema.js";

/** Hook to get a Portfolio document by its id */
export function usePortfolioDocumentById(
  documentId: string | null | undefined,
):
  | [PortfolioDocument, DocumentDispatch<PortfolioAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isPortfolioDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected Portfolio document */
export function useSelectedPortfolioDocument(): [
  PortfolioDocument,
  DocumentDispatch<PortfolioAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsPortfolioDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all Portfolio documents in the selected drive */
export function usePortfolioDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isPortfolioDocument);
}

/** Hook to get all Portfolio documents in the selected folder */
export function usePortfolioDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isPortfolioDocument);
}
