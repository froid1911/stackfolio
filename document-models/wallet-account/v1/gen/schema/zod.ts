/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  BackfillPhase,
  BackfillState,
  EventSource,
  EventSubtype,
  EventType,
  ImportEventsInput,
  ImportedEventInput,
  LedgerEvent,
  NativeBalance,
  RecordScanProgressInput,
  RetypeEventInput,
  ScanCursor,
  SetAccountDetailsInput,
  SetBackfillStateInput,
  SetEventIgnoredInput,
  SetEventNotesInput,
  SetIgnoredInput,
  SetNativeBalanceInput,
  SetWalletXpubInput,
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
  "DEPOSIT_ASSET",
  "DONATE",
  "FEE",
  "NONE",
  "REMOVE_ASSET",
  "SPAM",
  "WITHDRAWAL",
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

export function BackfillStateSchema(): z.ZodObject<Properties<BackfillState>> {
  return z.object({
    __typename: z.literal("BackfillState").optional(),
    nextBlock: z.number().nullish(),
    startBlock: z.number().nullish(),
    state: BackfillPhaseSchema,
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

export function SetWalletXpubInputSchema(): z.ZodObject<
  Properties<SetWalletXpubInput>
> {
  return z.object({
    xpub: z.string().nullish(),
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
    ignored: z.boolean(),
    label: z.string().nullish(),
    ledger: z.array(z.lazy(() => LedgerEventSchema())),
    nativeBalance: z.lazy(() => NativeBalanceSchema().nullish()),
  });
}
