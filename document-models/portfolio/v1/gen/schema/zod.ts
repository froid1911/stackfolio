/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unused-vars */
import * as z from "zod";
import type {
  AddAddressInput,
  AddBundleInput,
  AddCategoryRuleInput,
  AddressEntry,
  AssetValue,
  AssetValueInput,
  AutoSnapshot,
  Bundle,
  CategoryDirection,
  CategoryOverride,
  CategoryOverrideInput,
  CategoryRule,
  ClearEventCategoriesInput,
  ClearGrantInput,
  DeleteSnapshotInput,
  EventKeyInput,
  FixInput,
  GrantInfo,
  IssueInput,
  IssueSeverity,
  LocationValue,
  LocationValueInput,
  ManagedResources,
  PortfolioState,
  PositionAsset,
  PositionAssetInput,
  PositionEntry,
  PositionInput,
  PositionKind,
  PriceOverride,
  ReconcilerCheck,
  ReconcilerFix,
  ReconcilerIssue,
  RecordCheckInput,
  RecordResourcesInput,
  RemoveAddressInput,
  RemoveBundleInput,
  RemoveCategoryRuleInput,
  RemovePriceOverrideInput,
  SetAddressIgnoredInput,
  SetAssetIgnoredInput,
  SetAssetTrustedInput,
  SetEventCategoriesInput,
  SetGrantInput,
  SetPortfolioDetailsInput,
  SetPositionsInput,
  SetPriceOverrideInput,
  Snapshot,
  SnapshotLiability,
  SnapshotLiabilityInput,
  TakeSnapshotInput,
  TxCategory,
  UpdateAddressInput,
  UpdateBundleInput,
  UpdateCategoryRuleInput,
  WalletPositions,
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

export const CategoryDirectionSchema = z.enum(["ANY", "IN", "OUT"]);

export const IssueSeveritySchema = z.enum(["BLOCKING", "WARNING"]);

export const PositionKindSchema = z.enum(["LP", "SPOT"]);

export const TxCategorySchema = z.enum([
  "AIRDROP",
  "AIRDROP_NON_TAXABLE",
  "BORROWING",
  "COLLATERAL_IN",
  "COLLATERAL_OUT",
  "DEPOSIT",
  "DONATION",
  "FEE",
  "GIFT_IN",
  "GIFT_OUT",
  "INCOME",
  "LENDING_INCOME",
  "LIQUIDATION",
  "LOAN_REPAYMENT",
  "LOST",
  "MARGIN",
  "MINING",
  "SPEND",
  "STAKING",
  "STOLEN",
  "TRADE",
  "WITHDRAWAL",
]);

export function AddAddressInputSchema(): z.ZodObject<
  Properties<AddAddressInput>
> {
  return z.object({
    address: z.string(),
    chainId: z.number(),
    ensName: z.string().nullish(),
    id: z.string(),
    label: z.string().nullish(),
    timestamp: z.iso.datetime(),
  });
}

export function AddBundleInputSchema(): z.ZodObject<
  Properties<AddBundleInput>
> {
  return z.object({
    addresses: z.array(z.string()),
    id: z.string(),
    name: z.string(),
  });
}

export function AddCategoryRuleInputSchema(): z.ZodObject<
  Properties<AddCategoryRuleInput>
> {
  return z.object({
    asset: z.string().nullish(),
    category: TxCategorySchema,
    chainId: z.number().nullish(),
    counterparty: z.string(),
    direction: CategoryDirectionSchema,
    id: z.string(),
    label: z.string().nullish(),
  });
}

export function AddressEntrySchema(): z.ZodObject<Properties<AddressEntry>> {
  return z.object({
    __typename: z.literal("AddressEntry").optional(),
    addedAt: z.iso.datetime(),
    address: z.string(),
    chainId: z.number(),
    ensName: z.string().nullish(),
    id: z.string(),
    ignored: z.boolean(),
    label: z.string().nullish(),
    tags: z.array(z.string()),
  });
}

export function AssetValueSchema(): z.ZodObject<Properties<AssetValue>> {
  return z.object({
    __typename: z.literal("AssetValue").optional(),
    amount: z.string(),
    asset: z.string(),
    value: z.string(),
  });
}

export function AssetValueInputSchema(): z.ZodObject<
  Properties<AssetValueInput>
> {
  return z.object({
    amount: z.string(),
    asset: z.string(),
    value: z.string(),
  });
}

export function AutoSnapshotSchema(): z.ZodObject<Properties<AutoSnapshot>> {
  return z.object({
    __typename: z.literal("AutoSnapshot").optional(),
    enabled: z.boolean(),
    intervalHours: z.number(),
  });
}

export function BundleSchema(): z.ZodObject<Properties<Bundle>> {
  return z.object({
    __typename: z.literal("Bundle").optional(),
    addresses: z.array(z.string()),
    id: z.string(),
    name: z.string(),
  });
}

export function CategoryOverrideSchema(): z.ZodObject<
  Properties<CategoryOverride>
> {
  return z.object({
    __typename: z.literal("CategoryOverride").optional(),
    category: TxCategorySchema,
    eventId: z.string(),
    giftAcquiredAt: z.iso.datetime().nullish(),
    giftCost: z.string().nullish(),
    sequenceIndex: z.number(),
    wallet: z.string(),
  });
}

export function CategoryOverrideInputSchema(): z.ZodObject<
  Properties<CategoryOverrideInput>
> {
  return z.object({
    category: TxCategorySchema,
    eventId: z.string(),
    giftAcquiredAt: z.iso.datetime().nullish(),
    giftCost: z.string().nullish(),
    sequenceIndex: z.number(),
    wallet: z.string(),
  });
}

export function CategoryRuleSchema(): z.ZodObject<Properties<CategoryRule>> {
  return z.object({
    __typename: z.literal("CategoryRule").optional(),
    asset: z.string().nullish(),
    category: TxCategorySchema,
    chainId: z.number().nullish(),
    counterparty: z.string(),
    direction: CategoryDirectionSchema,
    id: z.string(),
    label: z.string().nullish(),
  });
}

export function ClearEventCategoriesInputSchema(): z.ZodObject<
  Properties<ClearEventCategoriesInput>
> {
  return z.object({
    events: z.array(z.lazy(() => EventKeyInputSchema())),
  });
}

export function ClearGrantInputSchema(): z.ZodObject<
  Properties<ClearGrantInput>
> {
  return z.object({
    _empty: z.boolean().nullish(),
  });
}

export function DeleteSnapshotInputSchema(): z.ZodObject<
  Properties<DeleteSnapshotInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function EventKeyInputSchema(): z.ZodObject<Properties<EventKeyInput>> {
  return z.object({
    eventId: z.string(),
    sequenceIndex: z.number(),
    wallet: z.string(),
  });
}

export function FixInputSchema(): z.ZodObject<Properties<FixInput>> {
  return z.object({
    at: z.iso.datetime(),
    code: z.string(),
    message: z.string(),
  });
}

export function GrantInfoSchema(): z.ZodObject<Properties<GrantInfo>> {
  return z.object({
    __typename: z.literal("GrantInfo").optional(),
    grantedAt: z.iso.datetime().nullish(),
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function IssueInputSchema(): z.ZodObject<Properties<IssueInput>> {
  return z.object({
    accountId: z.string().nullish(),
    code: z.string(),
    message: z.string(),
    severity: IssueSeveritySchema,
  });
}

export function LocationValueSchema(): z.ZodObject<Properties<LocationValue>> {
  return z.object({
    __typename: z.literal("LocationValue").optional(),
    location: z.string(),
    value: z.string(),
  });
}

export function LocationValueInputSchema(): z.ZodObject<
  Properties<LocationValueInput>
> {
  return z.object({
    location: z.string(),
    value: z.string(),
  });
}

export function ManagedResourcesSchema(): z.ZodObject<
  Properties<ManagedResources>
> {
  return z.object({
    __typename: z.literal("ManagedResources").optional(),
    connectionId: z.string(),
    workflowIds: z.array(z.string()),
  });
}

export function PortfolioStateSchema(): z.ZodObject<
  Properties<PortfolioState>
> {
  return z.object({
    __typename: z.literal("PortfolioState").optional(),
    addresses: z.array(z.lazy(() => AddressEntrySchema())),
    autoSnapshot: z.lazy(() => AutoSnapshotSchema()),
    baseCurrency: z.string(),
    bundles: z.array(z.lazy(() => BundleSchema())),
    categoryOverrides: z.array(z.lazy(() => CategoryOverrideSchema())),
    categoryRules: z.array(z.lazy(() => CategoryRuleSchema())),
    grant: z.lazy(() => GrantInfoSchema().nullish()),
    ignoredAssets: z.array(z.string()),
    lastCheck: z.lazy(() => ReconcilerCheckSchema().nullish()),
    name: z.string().nullish(),
    positions: z.array(z.lazy(() => WalletPositionsSchema())),
    priceOverrides: z.array(z.lazy(() => PriceOverrideSchema())),
    resources: z.lazy(() => ManagedResourcesSchema().nullish()),
    snapshots: z.array(z.lazy(() => SnapshotSchema())),
    trustedAssets: z.array(z.string()),
  });
}

export function PositionAssetSchema(): z.ZodObject<Properties<PositionAsset>> {
  return z.object({
    __typename: z.literal("PositionAsset").optional(),
    amount: z.string(),
    asset: z.string(),
  });
}

export function PositionAssetInputSchema(): z.ZodObject<
  Properties<PositionAssetInput>
> {
  return z.object({
    amount: z.string(),
    asset: z.string(),
  });
}

export function PositionEntrySchema(): z.ZodObject<Properties<PositionEntry>> {
  return z.object({
    __typename: z.literal("PositionEntry").optional(),
    assets: z.array(z.lazy(() => PositionAssetSchema())),
    kind: PositionKindSchema,
    note: z.string().nullish(),
    protocol: z.string(),
  });
}

export function PositionInputSchema(): z.ZodObject<Properties<PositionInput>> {
  return z.object({
    assets: z.array(z.lazy(() => PositionAssetInputSchema())),
    kind: PositionKindSchema,
    note: z.string().nullish(),
    protocol: z.string(),
  });
}

export function PriceOverrideSchema(): z.ZodObject<Properties<PriceOverride>> {
  return z.object({
    __typename: z.literal("PriceOverride").optional(),
    asset: z.string(),
    price: z.string(),
    setAt: z.iso.datetime(),
  });
}

export function ReconcilerCheckSchema(): z.ZodObject<
  Properties<ReconcilerCheck>
> {
  return z.object({
    __typename: z.literal("ReconcilerCheck").optional(),
    at: z.iso.datetime(),
    fixes: z.array(z.lazy(() => ReconcilerFixSchema())),
    issues: z.array(z.lazy(() => ReconcilerIssueSchema())),
  });
}

export function ReconcilerFixSchema(): z.ZodObject<Properties<ReconcilerFix>> {
  return z.object({
    __typename: z.literal("ReconcilerFix").optional(),
    at: z.iso.datetime(),
    code: z.string(),
    message: z.string(),
  });
}

export function ReconcilerIssueSchema(): z.ZodObject<
  Properties<ReconcilerIssue>
> {
  return z.object({
    __typename: z.literal("ReconcilerIssue").optional(),
    accountId: z.string().nullish(),
    code: z.string(),
    message: z.string(),
    severity: IssueSeveritySchema,
  });
}

export function RecordCheckInputSchema(): z.ZodObject<
  Properties<RecordCheckInput>
> {
  return z.object({
    at: z.iso.datetime(),
    fixes: z.array(z.lazy(() => FixInputSchema())),
    issues: z.array(z.lazy(() => IssueInputSchema())),
  });
}

export function RecordResourcesInputSchema(): z.ZodObject<
  Properties<RecordResourcesInput>
> {
  return z.object({
    connectionId: z.string(),
    workflowIds: z.array(z.string()),
  });
}

export function RemoveAddressInputSchema(): z.ZodObject<
  Properties<RemoveAddressInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveBundleInputSchema(): z.ZodObject<
  Properties<RemoveBundleInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemoveCategoryRuleInputSchema(): z.ZodObject<
  Properties<RemoveCategoryRuleInput>
> {
  return z.object({
    id: z.string(),
  });
}

export function RemovePriceOverrideInputSchema(): z.ZodObject<
  Properties<RemovePriceOverrideInput>
> {
  return z.object({
    asset: z.string(),
  });
}

export function SetAddressIgnoredInputSchema(): z.ZodObject<
  Properties<SetAddressIgnoredInput>
> {
  return z.object({
    id: z.string(),
    ignored: z.boolean(),
  });
}

export function SetAssetIgnoredInputSchema(): z.ZodObject<
  Properties<SetAssetIgnoredInput>
> {
  return z.object({
    asset: z.string(),
    ignored: z.boolean(),
  });
}

export function SetAssetTrustedInputSchema(): z.ZodObject<
  Properties<SetAssetTrustedInput>
> {
  return z.object({
    asset: z.string(),
    trusted: z.boolean(),
  });
}

export function SetEventCategoriesInputSchema(): z.ZodObject<
  Properties<SetEventCategoriesInput>
> {
  return z.object({
    overrides: z.array(z.lazy(() => CategoryOverrideInputSchema())),
  });
}

export function SetGrantInputSchema(): z.ZodObject<Properties<SetGrantInput>> {
  return z.object({
    grantedAt: z.iso.datetime().nullish(),
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function SetPortfolioDetailsInputSchema(): z.ZodObject<
  Properties<SetPortfolioDetailsInput>
> {
  return z.object({
    autoSnapshotEnabled: z.boolean().nullish(),
    autoSnapshotIntervalHours: z.number().nullish(),
    baseCurrency: z.string().nullish(),
    name: z.string().nullish(),
  });
}

export function SetPositionsInputSchema(): z.ZodObject<
  Properties<SetPositionsInput>
> {
  return z.object({
    chainId: z.number(),
    fetchedAt: z.iso.datetime(),
    positions: z.array(z.lazy(() => PositionInputSchema())),
    wallet: z.string(),
  });
}

export function SetPriceOverrideInputSchema(): z.ZodObject<
  Properties<SetPriceOverrideInput>
> {
  return z.object({
    asset: z.string(),
    price: z.string(),
    setAt: z.iso.datetime(),
  });
}

export function SnapshotSchema(): z.ZodObject<Properties<Snapshot>> {
  return z.object({
    __typename: z.literal("Snapshot").optional(),
    id: z.string(),
    liabilities: z.array(z.lazy(() => SnapshotLiabilitySchema())).nullish(),
    netWorth: z.string().nullish(),
    perAsset: z.array(z.lazy(() => AssetValueSchema())),
    perLocation: z.array(z.lazy(() => LocationValueSchema())),
    timestamp: z.iso.datetime(),
    totalValue: z.string(),
  });
}

export function SnapshotLiabilitySchema(): z.ZodObject<
  Properties<SnapshotLiability>
> {
  return z.object({
    __typename: z.literal("SnapshotLiability").optional(),
    amount: z.string(),
    asset: z.string(),
  });
}

export function SnapshotLiabilityInputSchema(): z.ZodObject<
  Properties<SnapshotLiabilityInput>
> {
  return z.object({
    amount: z.string(),
    asset: z.string(),
  });
}

export function TakeSnapshotInputSchema(): z.ZodObject<
  Properties<TakeSnapshotInput>
> {
  return z.object({
    id: z.string(),
    liabilities: z
      .array(z.lazy(() => SnapshotLiabilityInputSchema()))
      .nullish(),
    netWorth: z.string().nullish(),
    perAsset: z.array(z.lazy(() => AssetValueInputSchema())),
    perLocation: z.array(z.lazy(() => LocationValueInputSchema())),
    timestamp: z.iso.datetime(),
    totalValue: z.string(),
  });
}

export function UpdateAddressInputSchema(): z.ZodObject<
  Properties<UpdateAddressInput>
> {
  return z.object({
    ensName: z.string().nullish(),
    id: z.string(),
    label: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
  });
}

export function UpdateBundleInputSchema(): z.ZodObject<
  Properties<UpdateBundleInput>
> {
  return z.object({
    addresses: z.array(z.string()).nullish(),
    id: z.string(),
    name: z.string().nullish(),
  });
}

export function UpdateCategoryRuleInputSchema(): z.ZodObject<
  Properties<UpdateCategoryRuleInput>
> {
  return z.object({
    category: TxCategorySchema.nullish(),
    direction: CategoryDirectionSchema.nullish(),
    id: z.string(),
    label: z.string().nullish(),
  });
}

export function WalletPositionsSchema(): z.ZodObject<
  Properties<WalletPositions>
> {
  return z.object({
    __typename: z.literal("WalletPositions").optional(),
    chainId: z.number(),
    fetchedAt: z.iso.datetime(),
    positions: z.array(z.lazy(() => PositionEntrySchema())),
    wallet: z.string(),
  });
}
