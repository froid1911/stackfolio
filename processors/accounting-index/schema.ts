/**
 * The accounting index: cost-basis lots, realized disposals, income and
 * monthly P&L per wallet, plus the fold checkpoint that makes recomputation
 * conditional. Amounts and quantities are text (raw units, 1e8-scaled
 * values); the read side scales with BigInt.
 */

export interface EventRow {
  document_id: string;
  wallet: string;
  event_id: string;
  event_identifier: string;
  sequence_index: number;
  timestamp: string;
  type: string;
  subtype: string;
  asset: string;
  amount: string;
  counterparty: string | null;
  ignored: boolean;
  price: string | null;
  price_unit: string | null;
  price_source: string | null;
}

export interface AddressRow {
  document_id: string;
  address: string;
}

export interface AssetRow {
  document_id: string;
  asset: string;
  decimals: number;
}

export interface LotRow {
  wallet: string;
  asset: string;
  source_event_id: string;
  source_seq: number;
  quantity: string;
  unit_cost: string;
}

export interface RealizedRow {
  id: string;
  wallet: string;
  asset: string;
  timestamp: string;
  quantity: string;
  cost: string;
  proceeds: string;
  pnl: string;
  source_event_id: string;
  source_seq: number;
  consumed: string;
}

export interface IncomeRow {
  wallet: string;
  bucket: string;
  month: string;
  amount: string;
}

export interface PnlMonthRow {
  wallet: string;
  month: string;
  income: string;
  expense: string;
  realized_pnl: string;
  unpriced_in_count: number;
  unpriced_out_count: number;
}

export interface CheckpointRow {
  id: string;
  fold_version: number;
  ctx_hash: string;
  input_hash: string;
  state: string;
}

/** A leg the fold could not value: "basis" (no cost behind a disposal) or
 * "value" (no price for the leg). */
export interface UnpricedRow {
  wallet: string;
  event_id: string;
  sequence_index: number;
  asset: string;
  timestamp: string;
  reason: string;
}

export interface DB {
  acc_events: EventRow;
  acc_addresses: AddressRow;
  acc_assets: AssetRow;
  lots: LotRow;
  realized: RealizedRow;
  income: IncomeRow;
  pnl_month: PnlMonthRow;
  fold_checkpoint: CheckpointRow;
  acc_unpriced: UnpricedRow;
}
