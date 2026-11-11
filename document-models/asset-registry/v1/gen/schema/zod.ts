/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  Asset,
  AssetKind,
  AssetRegistryState,
  RegisterAssetInput,
  RemoveAssetInput,
  SetCoingeckoIdInput,
  UpdateAssetInput,
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

export const AssetKindSchema = z.enum(["ERC20", "NATIVE"]);

export function AssetSchema(): z.ZodObject<Properties<Asset>> {
  return z.object({
    __typename: z.literal("Asset").optional(),
    addedAt: z.iso.datetime(),
    chainId: z.number(),
    coingeckoId: z.string().nullish(),
    custom: z.boolean(),
    decimals: z.number(),
    id: z.string(),
    identifier: z.string(),
    kind: AssetKindSchema,
    name: z.string(),
    symbol: z.string(),
  });
}

export function AssetRegistryStateSchema(): z.ZodObject<
  Properties<AssetRegistryState>
> {
  return z.object({
    __typename: z.literal("AssetRegistryState").optional(),
    assets: z.array(z.lazy(() => AssetSchema())),
  });
}

export function RegisterAssetInputSchema(): z.ZodObject<
  Properties<RegisterAssetInput>
> {
  return z.object({
    addedAt: z.iso.datetime(),
    chainId: z.number(),
    coingeckoId: z.string().nullish(),
    custom: z.boolean(),
    decimals: z.number(),
    id: z.string(),
    identifier: z.string(),
    kind: AssetKindSchema,
    name: z.string(),
    symbol: z.string(),
  });
}

export function RemoveAssetInputSchema(): z.ZodObject<
  Properties<RemoveAssetInput>
> {
  return z.object({
    identifier: z.string(),
  });
}

export function SetCoingeckoIdInputSchema(): z.ZodObject<
  Properties<SetCoingeckoIdInput>
> {
  return z.object({
    coingeckoId: z.string().nullish(),
    identifier: z.string(),
  });
}

export function UpdateAssetInputSchema(): z.ZodObject<
  Properties<UpdateAssetInput>
> {
  return z.object({
    decimals: z.number().nullish(),
    identifier: z.string(),
    name: z.string().nullish(),
    symbol: z.string().nullish(),
  });
}
