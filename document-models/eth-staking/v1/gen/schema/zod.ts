/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  BalancePoint,
  BalancePointInput,
  EthStakingState,
  RecordBalancesInput,
  RecordStakeScanProgressInput,
  RecordWithdrawalsInput,
  RemoveValidatorsInput,
  StakeCursor,
  UpsertValidatorsInput,
  Validator,
  ValidatorInput,
  Withdrawal,
  WithdrawalInput,
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

export function BalancePointSchema(): z.ZodObject<Properties<BalancePoint>> {
  return z.object({
    __typename: z.literal("BalancePoint").optional(),
    balanceGwei: z.string(),
    day: z.string(),
    validatorIndex: z.number(),
  });
}

export function BalancePointInputSchema(): z.ZodObject<
  Properties<BalancePointInput>
> {
  return z.object({
    balanceGwei: z.string(),
    day: z.string(),
    validatorIndex: z.number(),
  });
}

export function EthStakingStateSchema(): z.ZodObject<
  Properties<EthStakingState>
> {
  return z.object({
    __typename: z.literal("EthStakingState").optional(),
    balanceHistory: z.array(z.lazy(() => BalancePointSchema())),
    cursor: z.lazy(() => StakeCursorSchema().nullish()),
    validators: z.array(z.lazy(() => ValidatorSchema())),
    withdrawals: z.array(z.lazy(() => WithdrawalSchema())),
  });
}

export function RecordBalancesInputSchema(): z.ZodObject<
  Properties<RecordBalancesInput>
> {
  return z.object({
    points: z.array(z.lazy(() => BalancePointInputSchema())),
    ranAt: z.iso.datetime(),
  });
}

export function RecordStakeScanProgressInputSchema(): z.ZodObject<
  Properties<RecordStakeScanProgressInput>
> {
  return z.object({
    lastBalanceDay: z.iso.datetime().nullish(),
    lastWithdrawalBlock: z.number().nullish(),
  });
}

export function RecordWithdrawalsInputSchema(): z.ZodObject<
  Properties<RecordWithdrawalsInput>
> {
  return z.object({
    withdrawals: z.array(z.lazy(() => WithdrawalInputSchema())),
  });
}

export function RemoveValidatorsInputSchema(): z.ZodObject<
  Properties<RemoveValidatorsInput>
> {
  return z.object({
    indices: z.array(z.number()),
  });
}

export function StakeCursorSchema(): z.ZodObject<Properties<StakeCursor>> {
  return z.object({
    __typename: z.literal("StakeCursor").optional(),
    lastBalanceDay: z.iso.datetime().nullish(),
    lastWithdrawalBlock: z.number().nullish(),
  });
}

export function UpsertValidatorsInputSchema(): z.ZodObject<
  Properties<UpsertValidatorsInput>
> {
  return z.object({
    validators: z.array(z.lazy(() => ValidatorInputSchema())),
  });
}

export function ValidatorSchema(): z.ZodObject<Properties<Validator>> {
  return z.object({
    __typename: z.literal("Validator").optional(),
    activationTimestamp: z.number().nullish(),
    exitedTimestamp: z.number().nullish(),
    index: z.number(),
    publicKey: z.string(),
    withdrawableTimestamp: z.number().nullish(),
    withdrawalAddress: z.string().nullish(),
  });
}

export function ValidatorInputSchema(): z.ZodObject<
  Properties<ValidatorInput>
> {
  return z.object({
    activationTimestamp: z.number().nullish(),
    exitedTimestamp: z.number().nullish(),
    index: z.number(),
    publicKey: z.string(),
    withdrawableTimestamp: z.number().nullish(),
    withdrawalAddress: z.string().nullish(),
  });
}

export function WithdrawalSchema(): z.ZodObject<Properties<Withdrawal>> {
  return z.object({
    __typename: z.literal("Withdrawal").optional(),
    amountGwei: z.string(),
    blockNumber: z.number(),
    id: z.string(),
    timestamp: z.iso.datetime(),
    validatorIndex: z.number(),
    withdrawalRef: z.number(),
  });
}

export function WithdrawalInputSchema(): z.ZodObject<
  Properties<WithdrawalInput>
> {
  return z.object({
    amountGwei: z.string(),
    blockNumber: z.number(),
    id: z.string(),
    timestamp: z.iso.datetime(),
    validatorIndex: z.number(),
    withdrawalRef: z.number(),
  });
}
