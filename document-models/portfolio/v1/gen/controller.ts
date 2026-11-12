/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { Portfolio } from "../module.js";
import type { PortfolioAction, PortfolioPHState } from "./types.js";

export const PortfolioController = PHDocumentController.forDocumentModel<
  PortfolioPHState,
  PortfolioAction
>(Portfolio);
