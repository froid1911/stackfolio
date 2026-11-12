/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { WalletAccount } from "../module.js";
import type { WalletAccountAction, WalletAccountPHState } from "./types.js";

export const WalletAccountController = PHDocumentController.forDocumentModel<
  WalletAccountPHState,
  WalletAccountAction
>(WalletAccount);
