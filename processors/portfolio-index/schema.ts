/**
 * The portfolio index: one row per ledger event, account, registry asset,
 * latest price, price point, snapshot, validator, balance point, withdrawal
 * and open check. Views read rows and sums, never whole documents - a
 * wallet document holds every event ever scanned, and loading it to draw a
 * ledger page is what made boards slow.
 *
 * Amounts are text, not floats: the documents hold exact decimal strings
 * (wei, gwei, prices) and the read side scales them with BigInt; a float
 * would silently round a 8e18 balance.
 */

export interface EventRow {
  document_id: string;
  /** The ledger event's id within its wallet document. */
  event_id: string;
  event_identifier: string;
  sequence_index: number;
  timestamp: string;
  type: string;
  subtype: string;
  asset: string;
  /** Exact decimal string as the ledger holds it. */
  amount: string;
  counterparty: string | null;
  counterparty_label: string | null;
  notes: string | null;
  ignored: boolean;
  source: string;
  /** The owning wallet's address and chain: every ledger query needs them. */
  address: string;
  chain_id: number;
  label: string | null;
}

export interface AssetRow {
  document_id: string;
  identifier: string;
  symbol: string;
  name: string;
  decimals: number;
  kind: string;
  chain_id: number;
  coingecko_id: string | null;
  custom: boolean;
}

export interface LatestPriceRow {
  document_id: string;
  asset: string;
  price: string;
  source: string;
  fetched_at: string;
}

export interface PricePointRow {
  document_id: string;
  asset: string;
  hour: string;
  price: string;
  source: string;
}

export interface SnapshotRow {
  document_id: string;
  id: string;
  timestamp: string;
  total_value: string;
  per_location_json: string;
  per_asset_json: string;
}

export interface OverrideRow {
  document_id: string;
  asset: string;
  price: string;
  set_at: string;
}

export interface AddressLabelRow {
  document_id: string;
  address: string;
  label: string | null;
  ens_name: string | null;
}

export interface ValidatorRow {
  document_id: string;
  validator_index: number;
  public_key: string;
  withdrawal_address: string | null;
  activation_ts: number | null;
  exited_ts: number | null;
  withdrawable_ts: number | null;
}

export interface BalancePointRow {
  document_id: string;
  validator_index: number;
  day: string;
  balance_gwei: string;
}

export interface WithdrawalRow {
  document_id: string;
  withdrawal_ref: number;
  validator_index: number;
  amount_gwei: string;
  block_number: number;
  timestamp: string;
}

export interface AccountRow {
  document_id: string;
  address: string;
  chain_id: number;
  label: string | null;
  ignored: boolean;
  last_logs_block: number | null;
  last_native_scan_block: number | null;
  last_run_at: string | null;
  backfill_state: string | null;
  native_balance: string | null;
  native_balance_block: number | null;
}

export interface CheckIssueRow {
  document_id: string;
  seq: number;
  code: string;
  severity: string;
  message: string;
  account_id: string | null;
  at: string;
}

export interface DB {
  events: EventRow;
  assets: AssetRow;
  prices_latest: LatestPriceRow;
  prices_history: PricePointRow;
  snapshots: SnapshotRow;
  price_overrides: OverrideRow;
  address_labels: AddressLabelRow;
  validators: ValidatorRow;
  staking_balances: BalancePointRow;
  withdrawals: WithdrawalRow;
  accounts: AccountRow;
  check_issues: CheckIssueRow;
}
