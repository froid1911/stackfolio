/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  FetchStatus,
  LatestPrice,
  PriceBookState,
  PricePoint,
  RecordFetchErrorInput,
  RecordPricesInput,
  RecordedPriceInput,
  SetBaseCurrencyInput,
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

export function FetchStatusSchema(): z.ZodObject<Properties<FetchStatus>> {
  return z.object({
    __typename: z.literal("FetchStatus").optional(),
    lastError: z.string().nullish(),
    lastFetchAt: z.iso.datetime().nullish(),
  });
}

export function LatestPriceSchema(): z.ZodObject<Properties<LatestPrice>> {
  return z.object({
    __typename: z.literal("LatestPrice").optional(),
    asset: z.string(),
    fetchedAt: z.iso.datetime(),
    price: z.string(),
    source: z.string(),
  });
}

export function PriceBookStateSchema(): z.ZodObject<
  Properties<PriceBookState>
> {
  return z.object({
    __typename: z.literal("PriceBookState").optional(),
    baseCurrency: z.string(),
    history: z.array(z.lazy(() => PricePointSchema())),
    latest: z.array(z.lazy(() => LatestPriceSchema())),
    status: z.lazy(() => FetchStatusSchema()),
  });
}

export function PricePointSchema(): z.ZodObject<Properties<PricePoint>> {
  return z.object({
    __typename: z.literal("PricePoint").optional(),
    asset: z.string(),
    hour: z.iso.datetime(),
    price: z.string(),
    source: z.string(),
  });
}

export function RecordFetchErrorInputSchema(): z.ZodObject<
  Properties<RecordFetchErrorInput>
> {
  return z.object({
    at: z.iso.datetime(),
    error: z.string(),
  });
}

export function RecordPricesInputSchema(): z.ZodObject<
  Properties<RecordPricesInput>
> {
  return z.object({
    baseCurrency: z.string(),
    fetchedAt: z.iso.datetime(),
    hour: z.iso.datetime(),
    prices: z.array(z.lazy(() => RecordedPriceInputSchema())),
  });
}

export function RecordedPriceInputSchema(): z.ZodObject<
  Properties<RecordedPriceInput>
> {
  return z.object({
    asset: z.string(),
    price: z.string(),
    source: z.string(),
  });
}

export function SetBaseCurrencyInputSchema(): z.ZodObject<
  Properties<SetBaseCurrencyInput>
> {
  return z.object({
    baseCurrency: z.string(),
  });
}
