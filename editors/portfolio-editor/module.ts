/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { EditorModule } from "document-model";
import type {
  PortfolioAction,
  PortfolioDocument,
} from "document-models/portfolio";
import { lazy } from "react";

/** Document editor module for the "stackfolio/portfolio" document type */
export const PortfolioEditor: EditorModule<PortfolioDocument, PortfolioAction> =
  {
    Component: lazy(() => import("./editor.js")),
    documentTypes: ["stackfolio/portfolio"],
    config: {
      id: "portfolio-editor",
      name: "Portfolio Editor",
    },
  };
