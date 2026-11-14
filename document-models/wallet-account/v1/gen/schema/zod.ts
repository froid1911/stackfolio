/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  BackfillPhase,
  BackfillState,
  EnsName,
  EnsNameInput,
  EventLocatorInput,
  EventSource,
  EventSubtype,
  EventType,
  ImportEventsInput,
  ImportedEventInput,
  LedgerEvent,
  NativeBalance,
  PinValuationInput,
  PinValuationsInput,
  RecordScanProgressInput,
  ReplaceEventsInput,
  RetypeEventInput,
  ScanCursor,
  SetAccountDetailsInput,
  SetBackfillStateInput,
  SetEnsNamesInput,
  SetEventIgnoredInput,
  SetEventNotesInput,
  SetIgnoredInput,
  SetNativeBalanceInput,
  SetRedecodeStateInput,
  SetTokenBalancesInput,
  SetWalletXpubInput,
  TokenBalance,
  TokenBalanceInput,
  TokenBalances,
  Valuation,
  ValuationGranularity,
  ValuationInput,
  ValuationSource,
  WalletAccountState,
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

export const BackfillPhaseSchema = z.enum(["DONE", "IDLE", "LOGS", "NATIVE"]);

export const EventSourceSchema = z.enum(["CHAIN", "MANUAL"]);

export const EventSubtypeSchema = z.enum([
  "AIRDROP",
  "APPROVE",
  "BLOCK_PRODUCTION",
  "BORROW",
  "BRIDGE",
  "DEPOSIT_ASSET",
  "DONATE",
  "FEE",
  "LIQUIDATION",
  "LP_BURN",
  "LP_MINT",
  "NAME_REGISTRATION",
  "NONE",
  "REMOVE_ASSET",
  "REPAY",
  "SPAM",
  "WITHDRAWAL",
  "YIELD",
]);

export const EventTypeSchema = z.enum([
  "INFORMATIONAL",
  "MIGRATE",
  "RECEIVE",
  "SPEND",
  "STAKING",
  "TRADE",
  "TRANSFER",
]);

export const ValuationGranularitySchema = z.enum(["DAY", "NONE"]);

export const ValuationSourceSchema = z.enum([
  "COINGECKO",
  "DEFILLAMA",
  "MANUAL",
  "UNPRICED",
]);

export function BackfillStateSchema(): z.ZodObject<Properties<BackfillState>> {
  return z.object({
    __typename: z.literal("BackfillState").optional(),
    nextBlock: z.number().nullish(),
    startBlock: z.number().nullish(),
    state: BackfillPhaseSchema,
  });
}

export function EnsNameSchema(): z.ZodObject<Properties<EnsName>> {
  return z.object({
    __typename: z.literal("EnsName").optional(),
    name: z.string(),
    owned: z.boolean(),
  });
}

export function EnsNameInputSchema(): z.ZodObject<Properties<EnsNameInput>> {
  return z.object({
    name: z.string(),
    owned: z.boolean(),
  });
}

export function EventLocatorInputSchema(): z.ZodObject<
  Properties<EventLocatorInput>
> {
  return z.object({
    id: z.string(),
    sequenceIndex: z.number(),
  });
}

export function ImportEventsInputSchema(): z.ZodObject<
  Properties<ImportEventsInput>
> {
  return z.object({
    batchId: z.string(),
    events: z.array(z.lazy(() => ImportedEventInputSchema())),
    importedAt: z.iso.datetime(),
  });
}

export function ImportedEventInputSchema(): z.ZodObject<
  Properties<ImportedEventInput>
> {
  return z.object({
    amount: z.string(),
    asset: z.string(),
    counterparty: z.string().nullish(),
    eventIdentifier: z.string(),
    id: z.string(),
    notes: z.string().nullish(),
    sequenceIndex: z.number(),
    subtype: EventSubtypeSchema,
    timestamp: z.iso.datetime(),
    type: EventTypeSchema,
    valuation: z.lazy(() => ValuationInputSchema().nullish()),
  });
}

export function LedgerEventSchema(): z.ZodObject<Properties<LedgerEvent>> {
  return z.object({
    __typename: z.literal("LedgerEvent").optional(),
    amount: z.string(),
    asset: z.string(),
    counterparty: z.string().nullish(),
    counterpartyLabel: z.string().nullish(),
    eventIdentifier: z.string(),
    id: z.string(),
    ignored: z.boolean(),
    importBatch: z.string().nullish(),
    notes: z.string().nullish(),
    sequenceIndex: z.number(),
    source: EventSourceSchema,
    subtype: EventSubtypeSchema,
    timestamp: z.iso.datetime(),
    type: EventTypeSchema,
    valuation: z.lazy(() => ValuationSchema().nullish()),
  });
}

export function NativeBalanceSchema(): z.ZodObject<Properties<NativeBalance>> {
  return z.object({
    __typename: z.literal("NativeBalance").optional(),
    amount: z.string(),
    blockNumber: z.number(),
    observedAt: z.iso.datetime(),
  });
}

export function PinValuationInputSchema(): z.ZodObject<
  Properties<PinValuationInput>
> {
  return z.object({
    id: z.string(),
    sequenceIndex: z.number(),
    valuation: z.lazy(() => ValuationInputSchema()),
  });
}

export function PinValuationsInputSchema(): z.ZodObject<
  Properties<PinValuationsInput>
> {
  return z.object({
    events: z.array(z.lazy(() => PinValuationInputSchema())),
  });
}

export function RecordScanProgressInputSchema(): z.ZodObject<
  Properties<RecordScanProgressInput>
> {
  return z.object({
    lastEventTimestamp: z.iso.datetime().nullish(),
    lastLogsBlock: z.number().nullish(),
    lastNativeScanBlock: z.number().nullish(),
    ranAt: z.iso.datetime(),
  });
}

export function ReplaceEventsInputSchema(): z.ZodObject<
  Properties<ReplaceEventsInput>
> {
  return z.object({
    add: z.array(z.lazy(() => ImportedEventInputSchema())),
    batchId: z.string(),
    remove: z.array(z.lazy(() => EventLocatorInputSchema())),
  });
}

export function RetypeEventInputSchema(): z.ZodObject<
  Properties<RetypeEventInput>
> {
  return z.object({
    id: z.string(),
    subtype: EventSubtypeSchema,
    type: EventTypeSchema,
  });
}

export function ScanCursorSchema(): z.ZodObject<Properties<ScanCursor>> {
  return z.object({
    __typename: z.literal("ScanCursor").optional(),
    lastEventTimestamp: z.iso.datetime().nullish(),
    lastLogsBlock: z.number().nullish(),
    lastNativeScanBlock: z.number().nullish(),
    lastRunAt: z.iso.datetime().nullish(),
  });
}

export function SetAccountDetailsInputSchema(): z.ZodObject<
  Properties<SetAccountDetailsInput>
> {
  return z.object({
    address: z.string().nullish(),
    chainId: z.number().nullish(),
    label: z.string().nullish(),
  });
}

export function SetBackfillStateInputSchema(): z.ZodObject<
  Properties<SetBackfillStateInput>
> {
  return z.object({
    nextBlock: z.number().nullish(),
    startBlock: z.number().nullish(),
    state: BackfillPhaseSchema,
  });
}

export function SetEnsNamesInputSchema(): z.ZodObject<
  Properties<SetEnsNamesInput>
> {
  return z.object({
    names: z.array(z.lazy(() => EnsNameInputSchema())),
  });
}

export function SetEventIgnoredInputSchema(): z.ZodObject<
  Properties<SetEventIgnoredInput>
> {
  return z.object({
    id: z.string(),
    ignored: z.boolean(),
  });
}

export function SetEventNotesInputSchema(): z.ZodObject<
  Properties<SetEventNotesInput>
> {
  return z.object({
    id: z.string(),
    notes: z.string().nullish(),
  });
}

export function SetIgnoredInputSchema(): z.ZodObject<
  Properties<SetIgnoredInput>
> {
  return z.object({
    ignored: z.boolean(),
  });
}

export function SetNativeBalanceInputSchema(): z.ZodObject<
  Properties<SetNativeBalanceInput>
> {
  return z.object({
    amount: z.string(),
    blockNumber: z.number(),
    observedAt: z.iso.datetime(),
  });
}

export function SetRedecodeStateInputSchema(): z.ZodObject<
  Properties<SetRedecodeStateInput>
> {
  return z.object({
    nextBlock: z.number().nullish(),
    startBlock: z.number().nullish(),
    state: BackfillPhaseSchema,
  });
}

export function SetTokenBalancesInputSchema(): z.ZodObject<
  Properties<SetTokenBalancesInput>
> {
  return z.object({
    balances: z.array(z.lazy(() => TokenBalanceInputSchema())),
    blockNumber: z.number(),
    observedAt: z.iso.datetime(),
  });
}

export function SetWalletXpubInputSchema(): z.ZodObject<
  Properties<SetWalletXpubInput>
> {
  return z.object({
    xpub: z.string().nullish(),
  });
}

export function TokenBalanceSchema(): z.ZodObject<Properties<TokenBalance>> {
  return z.object({
    __typename: z.literal("TokenBalance").optional(),
    amount: z.string(),
    asset: z.string(),
  });
}

export function TokenBalanceInputSchema(): z.ZodObject<
  Properties<TokenBalanceInput>
> {
  return z.object({
    amount: z.string(),
    asset: z.string(),
  });
}

export function TokenBalancesSchema(): z.ZodObject<Properties<TokenBalances>> {
  return z.object({
    __typename: z.literal("TokenBalances").optional(),
    balances: z.array(z.lazy(() => TokenBalanceSchema())),
    blockNumber: z.number(),
    observedAt: z.iso.datetime(),
  });
}

export function ValuationSchema(): z.ZodObject<Properties<Valuation>> {
  return z.object({
    __typename: z.literal("Valuation").optional(),
    granularity: ValuationGranularitySchema,
    pinnedAt: z.iso.datetime(),
    price: z.string(),
    source: ValuationSourceSchema,
    unit: z.string(),
  });
}

export function ValuationInputSchema(): z.ZodObject<
  Properties<ValuationInput>
> {
  return z.object({
    granularity: ValuationGranularitySchema,
    pinnedAt: z.iso.datetime(),
    price: z.string(),
    source: ValuationSourceSchema,
    unit: z.string(),
  });
}

export function WalletAccountStateSchema(): z.ZodObject<
  Properties<WalletAccountState>
> {
  return z.object({
    __typename: z.literal("WalletAccountState").optional(),
    address: z.string(),
    backfill: z.lazy(() => BackfillStateSchema().nullish()),
    bitcoinXpub: z.string().nullish(),
    chainId: z.number(),
    cursor: z.lazy(() => ScanCursorSchema().nullish()),
    ensNames: z.array(z.lazy(() => EnsNameSchema())),
    ignored: z.boolean(),
    label: z.string().nullish(),
    ledger: z.array(z.lazy(() => LedgerEventSchema())),
    nativeBalance: z.lazy(() => NativeBalanceSchema().nullish()),
    redecode: z.lazy(() => BackfillStateSchema().nullish()),
    tokenBalances: z.lazy(() => TokenBalancesSchema().nullish()),
  });
}
