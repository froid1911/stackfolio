/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  RegisterProtocolInputSchema,
  RetireProtocolInputSchema,
  UpdateProtocolInputSchema,
} from "../schema/zod.js";
import type {
  RegisterProtocolInput,
  RetireProtocolInput,
  UpdateProtocolInput,
} from "../types.js";
import type {
  RegisterProtocolAction,
  RetireProtocolAction,
  UpdateProtocolAction,
} from "./actions.js";

export const registerProtocol = (input: RegisterProtocolInput) =>
  createAction<RegisterProtocolAction>(
    "REGISTER_PROTOCOL",
    { ...input },
    undefined,
    RegisterProtocolInputSchema,
    "global",
  );

export const updateProtocol = (input: UpdateProtocolInput) =>
  createAction<UpdateProtocolAction>(
    "UPDATE_PROTOCOL",
    { ...input },
    undefined,
    UpdateProtocolInputSchema,
    "global",
  );

export const retireProtocol = (input: RetireProtocolInput) =>
  createAction<RetireProtocolAction>(
    "RETIRE_PROTOCOL",
    { ...input },
    undefined,
    RetireProtocolInputSchema,
    "global",
  );
