/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  PriceBookAction,
  PriceBookDocument,
} from "document-models/price-book";
import { lazy } from "react";

/** Document editor module for the "stackfolio/price-book" document type */
export const PriceBookEditor: EditorModule<PriceBookDocument, PriceBookAction> =
  {
    Component: lazy(() => import("./editor.js")),
    documentTypes: ["stackfolio/price-book"],
    config: {
      id: "price-book-editor",
      name: "Price Book Editor",
    },
  };
