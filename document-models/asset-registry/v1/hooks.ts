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
  AssetRegistryAction,
  AssetRegistryDocument,
} from "document-models/asset-registry/v1";
import {
  assertIsAssetRegistryDocument,
  isAssetRegistryDocument,
} from "./gen/document-schema.js";

/** Hook to get a AssetRegistry document by its id */
export function useAssetRegistryDocumentById(
  documentId: string | null | undefined,
):
  | [AssetRegistryDocument, DocumentDispatch<AssetRegistryAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isAssetRegistryDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected AssetRegistry document */
export function useSelectedAssetRegistryDocument(): [
  AssetRegistryDocument,
  DocumentDispatch<AssetRegistryAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsAssetRegistryDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all AssetRegistry documents in the selected drive */
export function useAssetRegistryDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isAssetRegistryDocument);
}

/** Hook to get all AssetRegistry documents in the selected folder */
export function useAssetRegistryDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isAssetRegistryDocument);
}
