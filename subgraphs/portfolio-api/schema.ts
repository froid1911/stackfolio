import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";

export const schema: DocumentNode = gql`
  type PortfolioApiSubgraphQueries {
    "Every wallet account the drive tracks, with its scan progress."
    accounts(driveId: String!): [PortfolioApiAccount!]!
    "One ledger page, newest first. Filters compose; \`query\` matches asset, address, label, note or identifier."
    events(
      driveId: String!
      address: String
      asset: String
      types: [String!]
      ignored: Boolean
      from: String
      to: String
      query: String
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
    validators(driveId: String!): [PortfolioApiValidator!]!
    stakingBalances(
      driveId: String!
      validatorIndex: Int
      from: String
      to: String
    ): [PortfolioApiStakingBalance!]!
    withdrawals(driveId: String!, validatorIndex: Int): [PortfolioApiWithdrawal!]!
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

  type Query {
    portfolioApi: PortfolioApiSubgraphQueries!
  }
`;
