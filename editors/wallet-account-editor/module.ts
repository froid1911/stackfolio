/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  WalletAccountAction,
  WalletAccountDocument,
} from "document-models/wallet-account";
import { lazy } from "react";

/** Document editor module for the "stackfolio/wallet-account" document type */
export const WalletAccountEditor: EditorModule<
  WalletAccountDocument,
  WalletAccountAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["stackfolio/wallet-account"],
  config: {
    id: "wallet-account-editor",
    name: "Wallet Account Editor",
  },
};
