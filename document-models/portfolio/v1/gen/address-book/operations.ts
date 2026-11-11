/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { PortfolioGlobalState } from "../types.js";
import type {
  AddAddressAction,
  RemoveAddressAction,
  SetAddressIgnoredAction,
  UpdateAddressAction,
} from "./actions.js";

export interface PortfolioAddressBookOperations {
  addAddressOperation: (
    state: PortfolioGlobalState,
    action: AddAddressAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateAddressOperation: (
    state: PortfolioGlobalState,
    action: UpdateAddressAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeAddressOperation: (
    state: PortfolioGlobalState,
    action: RemoveAddressAction,
    dispatch?: SignalDispatch,
  ) => void;
  setAddressIgnoredOperation: (
    state: PortfolioGlobalState,
    action: SetAddressIgnoredAction,
    dispatch?: SignalDispatch,
  ) => void;
}
