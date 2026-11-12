/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { PriceBook } from "../module.js";
import type { PriceBookAction, PriceBookPHState } from "./types.js";

export const PriceBookController = PHDocumentController.forDocumentModel<
  PriceBookPHState,
  PriceBookAction
>(PriceBook);
