export type Maybe<T> = T | null | undefined;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>;
};
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>;
};
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never };
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends " $fragmentName" | "__typename" ? T[P] : never;
    };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string };
  String: { input: string; output: string };
  Boolean: { input: boolean; output: boolean };
  Int: { input: number; output: number };
  Float: { input: number; output: number };
  Address: { input: `${string}:0x${string}`; output: `${string}:0x${string}` };
  Amount: {
    input: { unit?: string; value?: number };
    output: { unit?: string; value?: number };
  };
  Amount_Crypto: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Currency: {
    input: { unit: string; value: string };
    output: { unit: string; value: string };
  };
  Amount_Fiat: {
    input: { unit: string; value: number };
    output: { unit: string; value: number };
  };
  Amount_Money: { input: number; output: number };
  Amount_Percentage: { input: number; output: number };
  Amount_Tokens: { input: number; output: number };
  AttachmentRef: {
    input: `attachment://v${number}:${string}`;
    output: `attachment://v${number}:${string}`;
  };
  Currency: { input: string; output: string };
  Date: { input: string; output: string };
  DateTime: { input: string; output: string };
  EmailAddress: { input: string; output: string };
  EthereumAddress: { input: string; output: string };
  OID: { input: string; output: string };
  OLabel: { input: string; output: string };
  PHID: { input: string; output: string };
  URL: { input: string; output: string };
  Unknown: { input: unknown; output: unknown };
  Upload: { input: File; output: File };
};

export type BalancePoint = {
  balanceGwei: Scalars["String"]["output"];
  day: Scalars["String"]["output"];
  validatorIndex: Scalars["Int"]["output"];
};

export type BalancePointInput = {
  balanceGwei: Scalars["String"]["input"];
  day: Scalars["String"]["input"];
  validatorIndex: Scalars["Int"]["input"];
};

export type EthStakingState = {
  balanceHistory: Array<BalancePoint>;
  cursor: Maybe<StakeCursor>;
  validators: Array<Validator>;
  withdrawals: Array<Withdrawal>;
};

export type RecordBalancesInput = {
  points: Array<BalancePointInput>;
  ranAt: Scalars["DateTime"]["input"];
};

export type RecordStakeScanProgressInput = {
  lastBalanceDay?: InputMaybe<Scalars["DateTime"]["input"]>;
  lastWithdrawalBlock?: InputMaybe<Scalars["Int"]["input"]>;
};

export type RecordWithdrawalsInput = {
  withdrawals: Array<WithdrawalInput>;
};

export type StakeCursor = {
  lastBalanceDay: Maybe<Scalars["DateTime"]["output"]>;
  lastWithdrawalBlock: Maybe<Scalars["Int"]["output"]>;
};

export type UpsertValidatorsInput = {
  validators: Array<ValidatorInput>;
};

export type Validator = {
  activationTimestamp: Maybe<Scalars["Int"]["output"]>;
  exitedTimestamp: Maybe<Scalars["Int"]["output"]>;
  index: Scalars["Int"]["output"];
  publicKey: Scalars["String"]["output"];
  withdrawableTimestamp: Maybe<Scalars["Int"]["output"]>;
  withdrawalAddress: Maybe<Scalars["String"]["output"]>;
};

export type ValidatorInput = {
  activationTimestamp?: InputMaybe<Scalars["Int"]["input"]>;
  exitedTimestamp?: InputMaybe<Scalars["Int"]["input"]>;
  index: Scalars["Int"]["input"];
  publicKey: Scalars["String"]["input"];
  withdrawableTimestamp?: InputMaybe<Scalars["Int"]["input"]>;
  withdrawalAddress?: InputMaybe<Scalars["String"]["input"]>;
};

export type Withdrawal = {
  amountGwei: Scalars["String"]["output"];
  blockNumber: Scalars["Int"]["output"];
  id: Scalars["OID"]["output"];
  timestamp: Scalars["DateTime"]["output"];
  validatorIndex: Scalars["Int"]["output"];
  withdrawalRef: Scalars["Int"]["output"];
};

export type WithdrawalInput = {
  amountGwei: Scalars["String"]["input"];
  blockNumber: Scalars["Int"]["input"];
  id: Scalars["OID"]["input"];
  timestamp: Scalars["DateTime"]["input"];
  validatorIndex: Scalars["Int"]["input"];
  withdrawalRef: Scalars["Int"]["input"];
};
