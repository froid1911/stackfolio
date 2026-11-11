/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { SetPortfolioDetailsInputSchema } from "../schema/zod.js";
import type { SetPortfolioDetailsInput } from "../types.js";
import type { SetPortfolioDetailsAction } from "./actions.js";

export const setPortfolioDetails = (input: SetPortfolioDetailsInput) =>
  createAction<SetPortfolioDetailsAction>(
    "SET_PORTFOLIO_DETAILS",
    { ...input },
    undefined,
    SetPortfolioDetailsInputSchema,
    "global",
  );
