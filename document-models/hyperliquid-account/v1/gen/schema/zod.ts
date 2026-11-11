/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  HlAccount,
  HlFill,
  HlFillInput,
  HlPerpInput,
  HlPerpPosition,
  HlSpotBalance,
  HlSpotInput,
  HyperliquidAccountState,
  RecordSnapshotInput,
  UpsertAccountInput,
} from "./types.js";

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K]>;
}>;

type definedNonNullAny = {};

export const isDefinedNonNullAny = (v: any): v is definedNonNullAny =>
  v !== undefined && v !== null;

export const definedNonNullAnySchema = z
  .any()
  .refine((v) => isDefinedNonNullAny(v));

export function HlAccountSchema(): z.ZodObject<Properties<HlAccount>> {
  return z.object({
    __typename: z.literal("HlAccount").optional(),
    accountValueUsd: z.string().nullish(),
    address: z.string(),
    fills: z.array(z.lazy(() => HlFillSchema())),
    label: z.string().nullish(),
    perps: z.array(z.lazy(() => HlPerpPositionSchema())),
    spot: z.array(z.lazy(() => HlSpotBalanceSchema())),
    updatedAt: z.iso.datetime().nullish(),
  });
}

export function HlFillSchema(): z.ZodObject<Properties<HlFill>> {
  return z.object({
    __typename: z.literal("HlFill").optional(),
    closedPnl: z.string().nullish(),
    coin: z.string(),
    dir: z.string().nullish(),
    fee: z.string().nullish(),
    px: z.string(),
    side: z.string(),
    sz: z.string(),
    tid: z.number(),
    time: z.number(),
  });
}

export function HlFillInputSchema(): z.ZodObject<Properties<HlFillInput>> {
  return z.object({
    closedPnl: z.string().nullish(),
    coin: z.string(),
    dir: z.string().nullish(),
    fee: z.string().nullish(),
    px: z.string(),
    side: z.string(),
    sz: z.string(),
    tid: z.number(),
    time: z.number(),
  });
}

export function HlPerpInputSchema(): z.ZodObject<Properties<HlPerpInput>> {
  return z.object({
    coin: z.string(),
    entryPx: z.string(),
    positionValue: z.string(),
    szi: z.string(),
    unrealizedPnl: z.string(),
  });
}

export function HlPerpPositionSchema(): z.ZodObject<
  Properties<HlPerpPosition>
> {
  return z.object({
    __typename: z.literal("HlPerpPosition").optional(),
    coin: z.string(),
    entryPx: z.string(),
    positionValue: z.string(),
    szi: z.string(),
    unrealizedPnl: z.string(),
  });
}

export function HlSpotBalanceSchema(): z.ZodObject<Properties<HlSpotBalance>> {
  return z.object({
    __typename: z.literal("HlSpotBalance").optional(),
    coin: z.string(),
    hold: z.string(),
    tokenIndex: z.number(),
    total: z.string(),
  });
}

export function HlSpotInputSchema(): z.ZodObject<Properties<HlSpotInput>> {
  return z.object({
    coin: z.string(),
    hold: z.string(),
    tokenIndex: z.number(),
    total: z.string(),
  });
}

export function HyperliquidAccountStateSchema(): z.ZodObject<
  Properties<HyperliquidAccountState>
> {
  return z.object({
    __typename: z.literal("HyperliquidAccountState").optional(),
    accounts: z.array(z.lazy(() => HlAccountSchema())),
  });
}

export function RecordSnapshotInputSchema(): z.ZodObject<
  Properties<RecordSnapshotInput>
> {
  return z.object({
    accountValueUsd: z.string().nullish(),
    address: z.string(),
    fills: z.array(z.lazy(() => HlFillInputSchema())),
    perps: z.array(z.lazy(() => HlPerpInputSchema())),
    spot: z.array(z.lazy(() => HlSpotInputSchema())),
    updatedAt: z.iso.datetime(),
  });
}

export function UpsertAccountInputSchema(): z.ZodObject<
  Properties<UpsertAccountInput>
> {
  return z.object({
    address: z.string(),
    label: z.string().nullish(),
  });
}
