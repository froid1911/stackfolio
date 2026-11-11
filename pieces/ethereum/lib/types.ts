/** The wire shape `stackfolio/wallet-account`'s IMPORT_EVENTS consumes. */
export type EventType =
  | "SPEND"
  | "RECEIVE"
  | "TRADE"
  | "TRANSFER"
  | "STAKING"
  | "MIGRATE"
  | "INFORMATIONAL";

export type EventSubtype =
  | "NONE"
  | "FEE"
  | "APPROVE"
  | "WITHDRAWAL"
  | "BLOCK_PRODUCTION"
  | "SPAM"
  | "AIRDROP"
  | "DONATE"
  | "DEPOSIT_ASSET"
  | "REMOVE_ASSET";

/** One decoded ledger event; amounts are unsigned decimal strings in the
 * asset's smallest unit (wei for the native coin, base units for tokens),
 * the direction lives in `type`. `timestamp` is ISO 8601. */
export interface EventRow {
  eventIdentifier: string;
  sequenceIndex: number;
  timestamp: string;
  type: EventType;
  subtype: EventSubtype;
  asset: string;
  amount: string;
  counterparty: string;
  notes: string | null;
}

/** One bounded page of scanning: what was found, how far the cursor may
 * advance, which tokens were touched, and whether a block overflowed the
 * log cap (`truncated`: scan again from `lastBlock + 1` for the rest). */
export interface ScanPage {
  rows: EventRow[];
  lastBlock: number;
  tokens: string[];
  truncated: boolean;
}

/** The piece's connection settings: a local execution node, beacon API, and the indexer keys. */
export interface EthereumAuth {
  rpcUrl: string;
  beaconUrl: string;
  chainId: number;
  etherscanApiKey?: string;
  etherscanBaseUrl?: string;
  blockscoutApiKey?: string;
  ankrApiKey?: string;
  hyperliquidUrl?: string;
  bitcoinApiUrl?: string;
}
