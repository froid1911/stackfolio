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

export type BackfillPhase = "DONE" | "IDLE" | "LOGS" | "NATIVE";

export type BackfillState = {
  nextBlock: Maybe<Scalars["Int"]["output"]>;
  startBlock: Maybe<Scalars["Int"]["output"]>;
  state: BackfillPhase;
};

export type EnsName = {
  name: Scalars["String"]["output"];
  owned: Scalars["Boolean"]["output"];
};

export type EnsNameInput = {
  name: Scalars["String"]["input"];
  owned: Scalars["Boolean"]["input"];
};

export type EventLocatorInput = {
  id: Scalars["OID"]["input"];
  sequenceIndex: Scalars["Int"]["input"];
};

export type EventSource = "CHAIN" | "MANUAL";

export type EventSubtype =
  | "AIRDROP"
  | "APPROVE"
  | "BLOCK_PRODUCTION"
  | "BORROW"
  | "BRIDGE"
  | "DEPOSIT_ASSET"
  | "DONATE"
  | "FEE"
  | "LIQUIDATION"
  | "LP_BURN"
  | "LP_MINT"
  | "NAME_REGISTRATION"
  | "NONE"
  | "REMOVE_ASSET"
  | "REPAY"
  | "SPAM"
  | "WITHDRAWAL"
  | "YIELD";

export type EventType =
  | "INFORMATIONAL"
  | "MIGRATE"
  | "RECEIVE"
  | "SPEND"
  | "STAKING"
  | "TRADE"
  | "TRANSFER";

export type ImportEventsInput = {
  batchId: Scalars["String"]["input"];
  events: Array<ImportedEventInput>;
  importedAt: Scalars["DateTime"]["input"];
};

export type ImportedEventInput = {
  amount: Scalars["String"]["input"];
  asset: Scalars["String"]["input"];
  counterparty?: InputMaybe<Scalars["String"]["input"]>;
  eventIdentifier: Scalars["String"]["input"];
  id: Scalars["OID"]["input"];
  notes?: InputMaybe<Scalars["String"]["input"]>;
  sequenceIndex: Scalars["Int"]["input"];
  subtype: EventSubtype;
  timestamp: Scalars["DateTime"]["input"];
  type: EventType;
  valuation?: InputMaybe<ValuationInput>;
};

export type LedgerEvent = {
  amount: Scalars["String"]["output"];
  asset: Scalars["String"]["output"];
  counterparty: Maybe<Scalars["String"]["output"]>;
  counterpartyLabel: Maybe<Scalars["String"]["output"]>;
  eventIdentifier: Scalars["String"]["output"];
  id: Scalars["OID"]["output"];
  ignored: Scalars["Boolean"]["output"];
  importBatch: Maybe<Scalars["String"]["output"]>;
  notes: Maybe<Scalars["String"]["output"]>;
  sequenceIndex: Scalars["Int"]["output"];
  source: EventSource;
  subtype: EventSubtype;
  timestamp: Scalars["DateTime"]["output"];
  type: EventType;
  valuation: Maybe<Valuation>;
};

export type NativeBalance = {
  amount: Scalars["String"]["output"];
  blockNumber: Scalars["Int"]["output"];
  observedAt: Scalars["DateTime"]["output"];
};

export type PinValuationInput = {
  id: Scalars["OID"]["input"];
  sequenceIndex: Scalars["Int"]["input"];
  valuation: ValuationInput;
};

export type PinValuationsInput = {
  events: Array<PinValuationInput>;
};

export type RecordScanProgressInput = {
  lastEventTimestamp?: InputMaybe<Scalars["DateTime"]["input"]>;
  lastLogsBlock?: InputMaybe<Scalars["Int"]["input"]>;
  lastNativeScanBlock?: InputMaybe<Scalars["Int"]["input"]>;
  ranAt: Scalars["DateTime"]["input"];
};

export type ReplaceEventsInput = {
  add: Array<ImportedEventInput>;
  batchId: Scalars["String"]["input"];
  remove: Array<EventLocatorInput>;
};

export type RetypeEventInput = {
  id: Scalars["OID"]["input"];
  subtype: EventSubtype;
  type: EventType;
};

export type ScanCursor = {
  lastEventTimestamp: Maybe<Scalars["DateTime"]["output"]>;
  lastLogsBlock: Maybe<Scalars["Int"]["output"]>;
  lastNativeScanBlock: Maybe<Scalars["Int"]["output"]>;
  lastRunAt: Maybe<Scalars["DateTime"]["output"]>;
};

export type SetAccountDetailsInput = {
  address?: InputMaybe<Scalars["String"]["input"]>;
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  label?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetBackfillStateInput = {
  nextBlock?: InputMaybe<Scalars["Int"]["input"]>;
  startBlock?: InputMaybe<Scalars["Int"]["input"]>;
  state: BackfillPhase;
};

export type SetEnsNamesInput = {
  names: Array<EnsNameInput>;
};

export type SetEventIgnoredInput = {
  id: Scalars["OID"]["input"];
  ignored: Scalars["Boolean"]["input"];
};

export type SetEventNotesInput = {
  id: Scalars["OID"]["input"];
  notes?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetIgnoredInput = {
  ignored: Scalars["Boolean"]["input"];
};

export type SetNativeBalanceInput = {
  amount: Scalars["String"]["input"];
  blockNumber: Scalars["Int"]["input"];
  observedAt: Scalars["DateTime"]["input"];
};

export type SetRedecodeStateInput = {
  nextBlock?: InputMaybe<Scalars["Int"]["input"]>;
  startBlock?: InputMaybe<Scalars["Int"]["input"]>;
  state: BackfillPhase;
};

export type SetTokenBalancesInput = {
  balances: Array<TokenBalanceInput>;
  blockNumber: Scalars["Int"]["input"];
  observedAt: Scalars["DateTime"]["input"];
};

export type SetWalletXpubInput = {
  xpub?: InputMaybe<Scalars["String"]["input"]>;
};

export type TokenBalance = {
  amount: Scalars["String"]["output"];
  asset: Scalars["String"]["output"];
};

export type TokenBalanceInput = {
  amount: Scalars["String"]["input"];
  asset: Scalars["String"]["input"];
};

/**
 * Token balances read from the chain at one block: every token the ledger has
 * touched, zeros included, so an observed balance replaces the ledger's net.
 */
export type TokenBalances = {
  balances: Array<TokenBalance>;
  blockNumber: Scalars["Int"]["output"];
  observedAt: Scalars["DateTime"]["output"];
};

export type Valuation = {
  granularity: ValuationGranularity;
  pinnedAt: Scalars["DateTime"]["output"];
  price: Scalars["String"]["output"];
  source: ValuationSource;
  unit: Scalars["String"]["output"];
};

export type ValuationGranularity = "DAY" | "NONE";

export type ValuationInput = {
  granularity: ValuationGranularity;
  pinnedAt: Scalars["DateTime"]["input"];
  price: Scalars["String"]["input"];
  source: ValuationSource;
  unit: Scalars["String"]["input"];
};

export type ValuationSource = "COINGECKO" | "DEFILLAMA" | "MANUAL" | "UNPRICED";

export type WalletAccountState = {
  address: Scalars["String"]["output"];
  backfill: Maybe<BackfillState>;
  bitcoinXpub: Maybe<Scalars["String"]["output"]>;
  chainId: Scalars["Int"]["output"];
  cursor: Maybe<ScanCursor>;
  ensNames: Array<EnsName>;
  ignored: Scalars["Boolean"]["output"];
  label: Maybe<Scalars["String"]["output"]>;
  ledger: Array<LedgerEvent>;
  nativeBalance: Maybe<NativeBalance>;
  redecode: Maybe<BackfillState>;
  tokenBalances: Maybe<TokenBalances>;
};
