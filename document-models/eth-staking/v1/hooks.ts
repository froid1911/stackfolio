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
  EthStakingAction,
  EthStakingDocument,
} from "document-models/eth-staking/v1";
import {
  assertIsEthStakingDocument,
  isEthStakingDocument,
} from "./gen/document-schema.js";

/** Hook to get a EthStaking document by its id */
export function useEthStakingDocumentById(
  documentId: string | null | undefined,
):
  | [EthStakingDocument, DocumentDispatch<EthStakingAction>]
  | [undefined, undefined] {
  const [document, dispatch] = useDocumentById(documentId);
  if (!isEthStakingDocument(document)) return [undefined, undefined];
  return [document, dispatch];
}

/** Hook to get the selected EthStaking document */
export function useSelectedEthStakingDocument(): [
  EthStakingDocument,
  DocumentDispatch<EthStakingAction>,
] {
  const [document, dispatch] = useSelectedDocument();

  assertIsEthStakingDocument(document);
  return [document, dispatch] as const;
}

/** Hook to get all EthStaking documents in the selected drive */
export function useEthStakingDocumentsInSelectedDrive() {
  const documentsInSelectedDrive = useDocumentsInSelectedDrive();
  return documentsInSelectedDrive?.filter(isEthStakingDocument);
}

/** Hook to get all EthStaking documents in the selected folder */
export function useEthStakingDocumentsInSelectedFolder() {
  const documentsInSelectedFolder = useDocumentsInSelectedFolder();
  return documentsInSelectedFolder?.filter(isEthStakingDocument);
}
