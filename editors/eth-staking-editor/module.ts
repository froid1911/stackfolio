/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  EthStakingAction,
  EthStakingDocument,
} from "document-models/eth-staking";
import { lazy } from "react";

/** Document editor module for the "stackfolio/eth-staking" document type */
export const EthStakingEditor: EditorModule<
  EthStakingDocument,
  EthStakingAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["stackfolio/eth-staking"],
  config: {
    id: "eth-staking-editor",
    name: "ETH Staking Editor",
  },
};
