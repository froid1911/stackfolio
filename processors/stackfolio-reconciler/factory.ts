/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type {
  IProcessorHostModule,
  ProcessorFactoryBuilder,
  ProcessorFilter,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import { PORTFOLIO_TYPE, WALLET_TYPE, StackfolioReconciler } from "./processor.js";

/**
 * A portfolio can live in any drive, so every drive gets a reconciler; a
 * pass checks that the portfolio really belongs to its drive before it
 * writes anything.
 */
export const stackfolioReconcilerFactoryBuilder: ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => {
  return (driveHeader: PHDocumentHeader) => {
    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      documentType: [PORTFOLIO_TYPE, WALLET_TYPE],
      scope: ["global"],
    };
    const processor = new StackfolioReconciler(driveHeader.id, {
      read: module.read,
      dispatch: module.dispatch,
      host: module.host,
    });
    processor.start();
    // Re-reads each portfolio; a replay needs no state.
    return Promise.resolve([
      { processor, filter, replayState: "operations" as const },
    ]);
  };
};
