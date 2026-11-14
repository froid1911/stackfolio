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

export type AddAddressInput = {
  address: Scalars["String"]["input"];
  chainId: Scalars["Int"]["input"];
  ensName?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  label?: InputMaybe<Scalars["String"]["input"]>;
  timestamp: Scalars["DateTime"]["input"];
};

export type AddBundleInput = {
  addresses: Array<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  name: Scalars["String"]["input"];
};

export type AddCategoryRuleInput = {
  asset?: InputMaybe<Scalars["String"]["input"]>;
  category: TxCategory;
  chainId?: InputMaybe<Scalars["Int"]["input"]>;
  counterparty: Scalars["String"]["input"];
  direction: CategoryDirection;
  id: Scalars["OID"]["input"];
  label?: InputMaybe<Scalars["String"]["input"]>;
};

export type AddressEntry = {
  addedAt: Scalars["DateTime"]["output"];
  address: Scalars["String"]["output"];
  chainId: Scalars["Int"]["output"];
  ensName: Maybe<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  ignored: Scalars["Boolean"]["output"];
  label: Maybe<Scalars["String"]["output"]>;
  tags: Array<Scalars["String"]["output"]>;
};

export type AssetValue = {
  amount: Scalars["String"]["output"];
  asset: Scalars["String"]["output"];
  value: Scalars["String"]["output"];
};

export type AssetValueInput = {
  amount: Scalars["String"]["input"];
  asset: Scalars["String"]["input"];
  value: Scalars["String"]["input"];
};

export type AutoSnapshot = {
  enabled: Scalars["Boolean"]["output"];
  intervalHours: Scalars["Int"]["output"];
};

/** A named group of the portfolio's wallets: every page can be filtered to it. */
export type Bundle = {
  addresses: Array<Scalars["String"]["output"]>;
  id: Scalars["OID"]["output"];
  name: Scalars["String"]["output"];
};

export type CategoryDirection = "ANY" | "IN" | "OUT";

/** One transaction's category, chosen by hand. */
export type CategoryOverride = {
  category: TxCategory;
  eventId: Scalars["String"]["output"];
  giftAcquiredAt: Maybe<Scalars["DateTime"]["output"]>;
  giftCost: Maybe<Scalars["String"]["output"]>;
  sequenceIndex: Scalars["Int"]["output"];
  wallet: Scalars["String"]["output"];
};

export type CategoryOverrideInput = {
  category: TxCategory;
  eventId: Scalars["String"]["input"];
  giftAcquiredAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  giftCost?: InputMaybe<Scalars["String"]["input"]>;
  sequenceIndex: Scalars["Int"]["input"];
  wallet: Scalars["String"]["input"];
};

/** A counterparty rule: every matching transaction gets the category. */
export type CategoryRule = {
  asset: Maybe<Scalars["String"]["output"]>;
  category: TxCategory;
  chainId: Maybe<Scalars["Int"]["output"]>;
  counterparty: Scalars["String"]["output"];
  direction: CategoryDirection;
  id: Scalars["OID"]["output"];
  label: Maybe<Scalars["String"]["output"]>;
};

export type ClearEventCategoriesInput = {
  events: Array<EventKeyInput>;
};

export type ClearGrantInput = {
  _empty?: InputMaybe<Scalars["Boolean"]["input"]>;
};

export type DeleteSnapshotInput = {
  id: Scalars["OID"]["input"];
};

export type EventKeyInput = {
  eventId: Scalars["String"]["input"];
  sequenceIndex: Scalars["Int"]["input"];
  wallet: Scalars["String"]["input"];
};

export type FixInput = {
  at: Scalars["DateTime"]["input"];
  code: Scalars["String"]["input"];
  message: Scalars["String"]["input"];
};

export type GrantInfo = {
  grantedAt: Maybe<Scalars["DateTime"]["output"]>;
  id: Scalars["String"]["output"];
  name: Maybe<Scalars["String"]["output"]>;
};

export type IssueInput = {
  accountId?: InputMaybe<Scalars["String"]["input"]>;
  code: Scalars["String"]["input"];
  message: Scalars["String"]["input"];
  severity: IssueSeverity;
};

export type IssueSeverity = "BLOCKING" | "WARNING";

export type LocationValue = {
  location: Scalars["String"]["output"];
  value: Scalars["String"]["output"];
};

export type LocationValueInput = {
  location: Scalars["String"]["input"];
  value: Scalars["String"]["input"];
};

export type ManagedResources = {
  connectionId: Scalars["String"]["output"];
  workflowIds: Array<Scalars["String"]["output"]>;
};

export type PortfolioState = {
  addresses: Array<AddressEntry>;
  autoSnapshot: AutoSnapshot;
  baseCurrency: Scalars["String"]["output"];
  bundles: Array<Bundle>;
  categoryOverrides: Array<CategoryOverride>;
  categoryRules: Array<CategoryRule>;
  grant: Maybe<GrantInfo>;
  ignoredAssets: Array<Scalars["String"]["output"]>;
  lastCheck: Maybe<ReconcilerCheck>;
  name: Maybe<Scalars["String"]["output"]>;
  positions: Array<WalletPositions>;
  priceOverrides: Array<PriceOverride>;
  resources: Maybe<ManagedResources>;
  snapshots: Array<Snapshot>;
};

export type PositionAsset = {
  amount: Scalars["String"]["output"];
  asset: Scalars["String"]["output"];
};

export type PositionAssetInput = {
  amount: Scalars["String"]["input"];
  asset: Scalars["String"]["input"];
};

export type PositionEntry = {
  assets: Array<PositionAsset>;
  kind: PositionKind;
  note: Maybe<Scalars["String"]["output"]>;
  protocol: Scalars["String"]["output"];
};

export type PositionInput = {
  assets: Array<PositionAssetInput>;
  kind: PositionKind;
  note?: InputMaybe<Scalars["String"]["input"]>;
  protocol: Scalars["String"]["input"];
};

export type PositionKind = "LP" | "SPOT";

export type PriceOverride = {
  asset: Scalars["String"]["output"];
  price: Scalars["String"]["output"];
  setAt: Scalars["DateTime"]["output"];
};

export type ReconcilerCheck = {
  at: Scalars["DateTime"]["output"];
  fixes: Array<ReconcilerFix>;
  issues: Array<ReconcilerIssue>;
};

export type ReconcilerFix = {
  at: Scalars["DateTime"]["output"];
  code: Scalars["String"]["output"];
  message: Scalars["String"]["output"];
};

export type ReconcilerIssue = {
  accountId: Maybe<Scalars["String"]["output"]>;
  code: Scalars["String"]["output"];
  message: Scalars["String"]["output"];
  severity: IssueSeverity;
};

export type RecordCheckInput = {
  at: Scalars["DateTime"]["input"];
  fixes: Array<FixInput>;
  issues: Array<IssueInput>;
};

export type RecordResourcesInput = {
  connectionId: Scalars["String"]["input"];
  workflowIds: Array<Scalars["String"]["input"]>;
};

export type RemoveAddressInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveBundleInput = {
  id: Scalars["OID"]["input"];
};

export type RemoveCategoryRuleInput = {
  id: Scalars["OID"]["input"];
};

export type RemovePriceOverrideInput = {
  asset: Scalars["String"]["input"];
};

export type SetAddressIgnoredInput = {
  id: Scalars["OID"]["input"];
  ignored: Scalars["Boolean"]["input"];
};

export type SetAssetIgnoredInput = {
  asset: Scalars["String"]["input"];
  ignored: Scalars["Boolean"]["input"];
};

export type SetEventCategoriesInput = {
  overrides: Array<CategoryOverrideInput>;
};

export type SetGrantInput = {
  grantedAt?: InputMaybe<Scalars["DateTime"]["input"]>;
  id: Scalars["String"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetPortfolioDetailsInput = {
  autoSnapshotEnabled?: InputMaybe<Scalars["Boolean"]["input"]>;
  autoSnapshotIntervalHours?: InputMaybe<Scalars["Int"]["input"]>;
  baseCurrency?: InputMaybe<Scalars["String"]["input"]>;
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type SetPositionsInput = {
  chainId: Scalars["Int"]["input"];
  fetchedAt: Scalars["DateTime"]["input"];
  positions: Array<PositionInput>;
  wallet: Scalars["String"]["input"];
};

export type SetPriceOverrideInput = {
  asset: Scalars["String"]["input"];
  price: Scalars["String"]["input"];
  setAt: Scalars["DateTime"]["input"];
};

export type Snapshot = {
  id: Scalars["OID"]["output"];
  liabilities: Maybe<Array<SnapshotLiability>>;
  netWorth: Maybe<Scalars["String"]["output"]>;
  perAsset: Array<AssetValue>;
  perLocation: Array<LocationValue>;
  timestamp: Scalars["DateTime"]["output"];
  totalValue: Scalars["String"]["output"];
};

export type SnapshotLiability = {
  amount: Scalars["String"]["output"];
  asset: Scalars["String"]["output"];
};

export type SnapshotLiabilityInput = {
  amount: Scalars["String"]["input"];
  asset: Scalars["String"]["input"];
};

export type TakeSnapshotInput = {
  id: Scalars["OID"]["input"];
  liabilities?: InputMaybe<Array<SnapshotLiabilityInput>>;
  netWorth?: InputMaybe<Scalars["String"]["input"]>;
  perAsset: Array<AssetValueInput>;
  perLocation: Array<LocationValueInput>;
  timestamp: Scalars["DateTime"]["input"];
  totalValue: Scalars["String"]["input"];
};

export type TxCategory =
  | "AIRDROP"
  | "AIRDROP_NON_TAXABLE"
  | "BORROWING"
  | "COLLATERAL_IN"
  | "COLLATERAL_OUT"
  | "DEPOSIT"
  | "DONATION"
  | "FEE"
  | "GIFT_IN"
  | "GIFT_OUT"
  | "INCOME"
  | "LENDING_INCOME"
  | "LIQUIDATION"
  | "LOAN_REPAYMENT"
  | "LOST"
  | "MARGIN"
  | "MINING"
  | "SPEND"
  | "STAKING"
  | "STOLEN"
  | "TRADE"
  | "WITHDRAWAL";

export type UpdateAddressInput = {
  ensName?: InputMaybe<Scalars["String"]["input"]>;
  id: Scalars["OID"]["input"];
  label?: InputMaybe<Scalars["String"]["input"]>;
  tags?: InputMaybe<Array<Scalars["String"]["input"]>>;
};

export type UpdateBundleInput = {
  addresses?: InputMaybe<Array<Scalars["String"]["input"]>>;
  id: Scalars["OID"]["input"];
  name?: InputMaybe<Scalars["String"]["input"]>;
};

export type UpdateCategoryRuleInput = {
  category?: InputMaybe<TxCategory>;
  direction?: InputMaybe<CategoryDirection>;
  id: Scalars["OID"]["input"];
  label?: InputMaybe<Scalars["String"]["input"]>;
};

export type WalletPositions = {
  chainId: Scalars["Int"]["output"];
  fetchedAt: Scalars["DateTime"]["output"];
  positions: Array<PositionEntry>;
  wallet: Scalars["String"]["output"];
};
