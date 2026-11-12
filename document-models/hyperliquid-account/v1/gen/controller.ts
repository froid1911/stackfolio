/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { HyperliquidAccount } from "../module.js";
import type {
  HyperliquidAccountAction,
  HyperliquidAccountPHState,
} from "./types.js";

export const HyperliquidAccountController =
  PHDocumentController.forDocumentModel<
    HyperliquidAccountPHState,
    HyperliquidAccountAction
  >(HyperliquidAccount);
