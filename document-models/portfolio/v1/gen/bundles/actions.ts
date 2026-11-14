/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddBundleInput,
  RemoveBundleInput,
  UpdateBundleInput,
} from "../types.js";

export type AddBundleAction = Action & {
  type: "ADD_BUNDLE";
  input: AddBundleInput;
};
export type UpdateBundleAction = Action & {
  type: "UPDATE_BUNDLE";
  input: UpdateBundleInput;
};
export type RemoveBundleAction = Action & {
  type: "REMOVE_BUNDLE";
  input: RemoveBundleInput;
};

export type PortfolioBundlesAction =
  | AddBundleAction
  | UpdateBundleAction
  | RemoveBundleAction;
