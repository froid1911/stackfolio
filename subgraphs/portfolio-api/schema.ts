import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export const schema: DocumentNode = gql`
  type PortfolioApiSubgraphQueries {
    "Every wallet account the drive tracks, with its scan progress."
    accounts(driveId: String!): [PortfolioApiAccount!]!
    "One ledger page, newest first. Filters compose; 'query' matches asset, address, label, note or identifier."
    events(
      driveId: String!
      "Ledger event ids to pin to; a deep link from another view."
      ids: [String!]
      address: String
      asset: String
      types: [String!]
      ignored: Boolean
      from: String
      to: String
      query: String
      "Only the events P&L counted as unpriced: a leg without a price, or a disposal without cost basis."
      needsPrice: Boolean
      first: Int
      offset: Int
    ): PortfolioApiEventPage!
    addressLabels(driveId: String!): [PortfolioApiAddressLabel!]!
    assets(driveId: String!): [PortfolioApiAsset!]!
    latestPrices(driveId: String!): [PortfolioApiPrice!]!
    priceHistory(
      driveId: String!
      asset: String
      from: String
      to: String
    ): [PortfolioApiPricePoint!]!
    priceOverrides(driveId: String!): [PortfolioApiOverride!]!
    "Portfolio history, newest first."
    snapshots(driveId: String!, first: Int): [PortfolioApiSnapshot!]!
    "Balances matrix over the ledger: holdings per (asset, wallet) with per-asset and per-account totals; ignored events excluded."
    holdings(driveId: String!): PortfolioApiBalances!
    validators(driveId: String!): [PortfolioApiValidator!]!
    stakingBalances(
      driveId: String!
      validatorIndex: Int
      from: String
      to: String
    ): [PortfolioApiStakingBalance!]!
    withdrawals(driveId: String!, validatorIndex: Int): [PortfolioApiWithdrawal!]!
    "Open cost-basis lots, oldest source event first. 'wallet' filters to one address as stored (lower-case)."
    openLots(driveId: String!, wallet: String): [PortfolioApiLot!]!
    "Realized disposals, newest first; 'consumed' names the lots each one drew from."
    realizedEvents(
      driveId: String!
      wallet: String
      from: String
      to: String
    ): [PortfolioApiRealizedEvent!]!
    "Income bucketed per month, newest month first."
    incomeByMonth(driveId: String!, wallet: String): [PortfolioApiIncome!]!
    "Monthly P&L buckets inside [from, to]; months compare by YYYY-MM prefix. Only grouping: MONTH (default)."
    pnlReport(
      driveId: String!
      from: String!
      to: String!
      grouping: String
      wallet: String
    ): [PortfolioApiPnlBucket!]!
    "Months carrying unpriced disposals: in = without enough cost basis, out = without a value."
    unpricedSummary(driveId: String!, wallet: String): [PortfolioApiUnpriced!]!
    "Hyperliquid accounts tracked by the portfolio, with spot balances and open positions."
    hyperliquidAccounts(driveId: String!): [PortfolioApiHlAccount!]!
    "Open reconciler findings."
    issues(driveId: String!, severity: String): [PortfolioApiIssue!]!
    "Forward ENS lookup on the given JSON-RPC node; null when the name has no ETH address there."
    ensAddress(name: String!, rpcUrl: String!): String
    "Header numbers for the dashboard."
    totals(driveId: String!): PortfolioApiTotals!
  }

  type PortfolioApiAccount {
    documentId: String!
    address: String!
    chainId: Int!
    label: String
    ignored: Boolean!
    lastLogsBlock: Int
    lastNativeScanBlock: Int
    lastRunAt: String
    backfillState: String
    nativeBalance: String
    nativeBalanceBlock: Int
  }

  type PortfolioApiEventPage {
    rows: [PortfolioApiEvent!]!
    total: Int!
  }

  type PortfolioApiEvent {
    documentId: String!
    eventId: String!
    eventIdentifier: String!
    sequenceIndex: Int!
    timestamp: String!
    type: String!
    subtype: String!
    asset: String!
    "Exact decimal string; scale it with the asset's decimals client-side."
    amount: String!
    counterparty: String
    counterpartyLabel: String
    notes: String
    ignored: Boolean!
    source: String!
    address: String!
    chainId: Int!
    "The wallet's own label."
    label: String
    "The books' price per whole unit for this leg; null when it has none."
    price: String
    priceUnit: String
    priceSource: String
    "Why the books could not value this leg: value (it has no price) or basis (no cost behind a disposal); null when they could."
    priceGap: String
  }

  type PortfolioApiAddressLabel {
    documentId: String!
    address: String!
    label: String
    ensName: String
  }

  type PortfolioApiAsset {
    documentId: String!
    identifier: String!
    symbol: String!
    name: String!
    decimals: Int!
    kind: String!
    chainId: Int!
    coingeckoId: String
    custom: Boolean!
  }

  type PortfolioApiPrice {
    asset: String!
    price: String!
    source: String!
    fetchedAt: String!
  }

  type PortfolioApiPricePoint {
    asset: String!
    hour: String!
    price: String!
  }

  type PortfolioApiOverride {
    documentId: String!
    asset: String!
    price: String!
    setAt: String!
  }

  type PortfolioApiSnapshot {
    documentId: String!
    id: String!
    timestamp: String!
    totalValue: String!
    locations: [PortfolioApiLocationValue!]!
    assets: [PortfolioApiAssetValue!]!
  }

  type PortfolioApiLocationValue {
    location: String!
    value: String!
  }

  type PortfolioApiAssetValue {
    asset: String!
    amount: String!
    value: String!
  }

  "One (asset, wallet) holding, folded from the ledger at read time."
  type PortfolioApiHolding {
    asset: String!
    symbol: String!
    "The wallet address as stored (lower-case)."
    wallet: String!
    "Token units at the asset's decimals (raw units when unregistered)."
    quantity: String!
    "Fiat value at the latest price (portfolio overrides win); null when the asset is unpriced or unregistered - never a guess."
    value: String
  }

  type PortfolioApiAssetTotal {
    asset: String!
    symbol: String!
    quantity: String!
    "null when no row of the asset carries a value."
    value: String
  }

  type PortfolioApiAccountTotal {
    wallet: String!
    ensName: String
    label: String
    value: String!
  }

  "The balances matrix: holdings rows plus per-asset and per-account totals."
  type PortfolioApiBalances {
    holdings: [PortfolioApiHolding!]!
    perAsset: [PortfolioApiAssetTotal!]!
    perAccount: [PortfolioApiAccountTotal!]!
    total: String!
  }

  type PortfolioApiValidator {
    documentId: String!
    validatorIndex: Int!
    publicKey: String!
    withdrawalAddress: String
    activationTs: Int
    exitedTs: Int
    withdrawableTs: Int
  }

  type PortfolioApiStakingBalance {
    documentId: String!
    validatorIndex: Int!
    day: String!
    balanceGwei: String!
  }

  type PortfolioApiWithdrawal {
    documentId: String!
    withdrawalRef: Int!
    validatorIndex: Int!
    amountGwei: String!
    blockNumber: Int!
    timestamp: String!
  }

  type PortfolioApiHlAccount {
    documentId: String!
    address: String!
    label: String
    accountValueUsd: String
    updatedAt: String
    spot: [PortfolioApiHlSpot!]!
    perps: [PortfolioApiHlPerp!]!
  }

  type PortfolioApiHlSpot {
    tokenIndex: Int!
    coin: String!
    total: String!
    hold: String!
  }

  type PortfolioApiHlPerp {
    coin: String!
    szi: String!
    entryPx: String!
    positionValue: String!
    unrealizedPnl: String!
  }

  type PortfolioApiIssue {
    documentId: String!
    seq: Int!
    code: String!
    severity: String!
    message: String!
    accountId: String
    at: String!
  }

  type PortfolioApiTotals {
    events: Int!
    accounts: Int!
    validators: Int!
    openIssues: Int!
    "Total value of the newest snapshot, or null before the first one."
    totalValue: String
    snapshotAt: String
  }

  type PortfolioApiLot {
    wallet: String!
    asset: String!
    "Ledger event id that created the lot."
    sourceEventId: String!
    sourceSeq: Int!
    "Remaining quantity in raw units."
    quantity: String!
    "Cost per whole unit (registry decimals), 8 decimals."
    unitCost: String!
  }

  type PortfolioApiConsumedLot {
    sourceEventId: String!
    quantity: String!
    cost: String!
  }

  type PortfolioApiRealizedEvent {
    id: String!
    wallet: String!
    asset: String!
    timestamp: String!
    quantity: String!
    cost: String!
    proceeds: String!
    pnl: String!
    sourceEventId: String!
    sourceSeq: Int!
    consumed: [PortfolioApiConsumedLot!]!
  }

  type PortfolioApiIncome {
    wallet: String!
    bucket: String!
    month: String!
    amount: String!
  }

  type PortfolioApiPnlBucket {
    wallet: String!
    month: String!
    income: String!
    expense: String!
    realizedPnl: String!
    unpricedIn: Int!
    unpricedOut: Int!
  }

  type PortfolioApiUnpriced {
    wallet: String!
    month: String!
    inCount: Int!
    outCount: Int!
  }

  type Query {
    portfolioApi: PortfolioApiSubgraphQueries!
  }
`;
