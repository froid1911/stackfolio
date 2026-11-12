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
  ProtocolRegistryAction,
  ProtocolRegistryDocument,
} from "document-models/protocol-registry/v1";
import {
  assertIsProtocolRegistryDocument,
  isProtocolRegistryDocument,
} from "./gen/document-schema.js";

/** Hook to get a ProtocolRegistry document by its id */
export function useProtocolRegistryDocumentById(
  documentId: string | null | undefined,
):
  | [ProtocolRegistryDocument, DocumentDispatch<ProtocolRegistryAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isProtocolRegistryDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected ProtocolRegistry document */
export function useSelectedProtocolRegistryDocument(): [
  ProtocolRegistryDocument,
  DocumentDispatch<ProtocolRegistryAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsProtocolRegistryDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all ProtocolRegistry documents in the selected drive */
export function useProtocolRegistryDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isProtocolRegistryDocument);
}

/** Hook to get all ProtocolRegistry documents in the selected folder */
export function useProtocolRegistryDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isProtocolRegistryDocument);
}
