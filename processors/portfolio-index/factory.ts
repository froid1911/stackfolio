/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type {
  IProcessorHostModule,
  ProcessorApp,
  ProcessorFactoryBuilder,
  ProcessorFilter,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import {
  INDEXED_DOCUMENT_TYPES,
  PortfolioIndex,
} from "./processor.js";

/**
 * One index per drive: the portfolio reads its numbers within its drive,
 * and the drive is the portfolio's boundary.
 */
export const portfolioIndexFactoryBuilder: ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => {
  return async (driveHeader: PHDocumentHeader, _processorApp?: ProcessorApp) => {
    // One index per drive: the tables are read within their drive.
    const namespace = PortfolioIndex.getNamespace(driveHeader.id);
    const store =
      await module.relationalDb.createNamespace<PortfolioIndex>(namespace);

    // An omitted field matches every value; only `documentId` honours "*".
    // Scope "document" carries DELETE_DOCUMENT and PURGE_DOCUMENT.
    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      documentType: [...INDEXED_DOCUMENT_TYPES],
      scope: ["global", "document"],
    };

    // The drive id lets the processor drop its namespace on the drive's deletion.
    const processor = new PortfolioIndex(namespace, filter, store, driveHeader.id);

    // Nothing in the runtime calls this, so without it the first write hits
    // a database with no tables.
    await processor.initAndUpgrade();

    return [{ processor, filter }];
  };
};
