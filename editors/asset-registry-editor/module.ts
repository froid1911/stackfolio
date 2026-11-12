/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  AssetRegistryAction,
  AssetRegistryDocument,
} from "document-models/asset-registry";
import { lazy } from "react";

/** Document editor module for the "stackfolio/asset-registry" document type */
export const AssetRegistryEditor: EditorModule<
  AssetRegistryDocument,
  AssetRegistryAction
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["stackfolio/asset-registry"],
  config: {
    id: "asset-registry-editor",
    name: "Asset Registry Editor",
  },
};
