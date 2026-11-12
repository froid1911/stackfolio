/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  ChainManifest,
  ChainManifestInput,
  ContractKind,
  ContractRef,
  ContractRefInput,
  EventRule,
  EventRuleInput,
  EventSemantic,
  EventSemanticInput,
  ProtocolEntry,
  ProtocolEntryInput,
  ProtocolRegistryState,
  ProtocolStatus,
  RegisterProtocolInput,
  RetireProtocolInput,
  UpdateProtocolInput,
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

export const ContractKindSchema = z.enum(["CORE", "DEBT", "POSITION"]);

export const ProtocolStatusSchema = z.enum(["ACTIVE", "RETIRED"]);

export function ChainManifestSchema(): z.ZodObject<Properties<ChainManifest>> {
  return z.object({
    __typename: z.literal("ChainManifest").optional(),
    chainId: z.number(),
    contracts: z.array(z.lazy(() => ContractRefSchema())),
    events: z.array(z.lazy(() => EventRuleSchema())),
  });
}

export function ChainManifestInputSchema(): z.ZodObject<
  Properties<ChainManifestInput>
> {
  return z.object({
    chainId: z.number(),
    contracts: z.array(z.lazy(() => ContractRefInputSchema())),
    events: z.array(z.lazy(() => EventRuleInputSchema())),
  });
}

export function ContractRefSchema(): z.ZodObject<Properties<ContractRef>> {
  return z.object({
    __typename: z.literal("ContractRef").optional(),
    address: z.string(),
    kind: ContractKindSchema,
    name: z.string(),
    underlying: z.string().nullish(),
  });
}

export function ContractRefInputSchema(): z.ZodObject<
  Properties<ContractRefInput>
> {
  return z.object({
    address: z.string(),
    kind: ContractKindSchema,
    name: z.string(),
    underlying: z.string().nullish(),
  });
}

export function EventRuleSchema(): z.ZodObject<Properties<EventRule>> {
  return z.object({
    __typename: z.literal("EventRule").optional(),
    name: z.string(),
    semantic: z.lazy(() => EventSemanticSchema()),
    topic: z.string(),
  });
}

export function EventRuleInputSchema(): z.ZodObject<
  Properties<EventRuleInput>
> {
  return z.object({
    name: z.string(),
    semantic: z.lazy(() => EventSemanticInputSchema()),
    topic: z.string(),
  });
}

export function EventSemanticSchema(): z.ZodObject<Properties<EventSemantic>> {
  return z.object({
    __typename: z.literal("EventSemantic").optional(),
    subtype: z.string(),
    type: z.string(),
  });
}

export function EventSemanticInputSchema(): z.ZodObject<
  Properties<EventSemanticInput>
> {
  return z.object({
    subtype: z.string(),
    type: z.string(),
  });
}

export function ProtocolEntrySchema(): z.ZodObject<Properties<ProtocolEntry>> {
  return z.object({
    __typename: z.literal("ProtocolEntry").optional(),
    chains: z.array(z.lazy(() => ChainManifestSchema())),
    id: z.string(),
    notes: z.string().nullish(),
    plugins: z.array(z.string()),
    status: ProtocolStatusSchema,
    updatedAt: z.iso.datetime().nullish(),
  });
}

export function ProtocolEntryInputSchema(): z.ZodObject<
  Properties<ProtocolEntryInput>
> {
  return z.object({
    chains: z.array(z.lazy(() => ChainManifestInputSchema())),
    id: z.string(),
    notes: z.string().nullish(),
    plugins: z.array(z.string()).nullish(),
  });
}

export function ProtocolRegistryStateSchema(): z.ZodObject<
  Properties<ProtocolRegistryState>
> {
  return z.object({
    __typename: z.literal("ProtocolRegistryState").optional(),
    protocols: z.array(z.lazy(() => ProtocolEntrySchema())),
  });
}

export function RegisterProtocolInputSchema(): z.ZodObject<
  Properties<RegisterProtocolInput>
> {
  return z.object({
    entry: z.lazy(() => ProtocolEntryInputSchema()),
    updatedAt: z.iso.datetime(),
  });
}

export function RetireProtocolInputSchema(): z.ZodObject<
  Properties<RetireProtocolInput>
> {
  return z.object({
    id: z.string(),
    updatedAt: z.iso.datetime(),
  });
}

export function UpdateProtocolInputSchema(): z.ZodObject<
  Properties<UpdateProtocolInput>
> {
  return z.object({
    entry: z.lazy(() => ProtocolEntryInputSchema()),
    updatedAt: z.iso.datetime(),
  });
}
