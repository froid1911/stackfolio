/**
 * Rows off the resulting state: every state parse in the index lives here,
 * pure, so a test can hand it a document's global state and read the rows
 * back without a database. The processor only diffs these against the
 * tables (and deletes by document id); nothing here touches SQL.
 */
import type {
  AccountRow,
  AssetRow,
  BalancePointRow,
  CheckIssueRow,
  EventRow,
  LatestPriceRow,
  OverrideRow,
  AddressLabelRow,
  PricePointRow,
  SnapshotRow,
  ValidatorRow,
  WithdrawalRow,
} from "./schema.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown, whenMissing = false): boolean {
  return typeof value === "boolean" ? value : whenMissing;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface WalletIndex {
  account: AccountRow;
  events: EventRow[];
}

/** A wallet document's account row and every ledger event. */
export function walletRows(
  documentId: string,
  global: unknown,
): WalletIndex | null {
  const state = asRecord(global);
  const address = str(state?.address);
  const chainId = num(state?.chainId);
  if (!state || address === null || chainId === null) return null;
  const cursor = asRecord(state.cursor);
  const backfill = asRecord(state.backfill);
  const native = asRecord(state.nativeBalance);
  const events: EventRow[] = [];
  for (const entry of list(state.ledger)) {
    const event = asRecord(entry);
    const id = str(event?.id);
    const amount = str(event?.amount);
    if (!event || id === null || amount === null) continue;
    events.push({
      document_id: documentId,
      event_id: id,
      event_identifier: str(event.eventIdentifier) ?? "",
      sequence_index: num(event.sequenceIndex) ?? 0,
      timestamp: str(event.timestamp) ?? "",
      type: str(event.type) ?? "",
      subtype: str(event.subtype) ?? "",
      asset: str(event.asset) ?? "",
      amount,
      counterparty: str(event.counterparty),
      counterparty_label: str(event.counterpartyLabel),
      notes: str(event.notes),
      ignored: bool(event.ignored),
      source: str(event.source) ?? "CHAIN",
      address,
      chain_id: chainId,
      label: str(state.label),
    });
  }
  return {
    account: {
      document_id: documentId,
      address,
      chain_id: chainId,
      label: str(state.label),
      ignored: bool(state.ignored),
      last_logs_block: num(cursor?.lastLogsBlock),
      last_native_scan_block: num(cursor?.lastNativeScanBlock),
      last_run_at: str(cursor?.lastRunAt),
      backfill_state: str(backfill?.state),
      native_balance: str(native?.amount),
      native_balance_block: num(native?.blockNumber),
    },
    events,
  };
}

export interface PortfolioIndex {
  snapshots: SnapshotRow[];
  overrides: OverrideRow[];
  labels: AddressLabelRow[];
  issues: CheckIssueRow[];
}

/** Snapshots, price overrides, the address book and the open check. */
export function portfolioRows(
  documentId: string,
  global: unknown,
): PortfolioIndex | null {
  const state = asRecord(global);
  if (!state) return null;
  const snapshots: SnapshotRow[] = [];
  for (const entry of list(state.snapshots)) {
    const snapshot = asRecord(entry);
    const id = str(snapshot?.id);
    if (!snapshot || id === null) continue;
    snapshots.push({
      document_id: documentId,
      id,
      timestamp: str(snapshot.timestamp) ?? "",
      total_value: str(snapshot.totalValue) ?? "0",
      per_location_json: JSON.stringify(list(snapshot.perLocation)),
      per_asset_json: JSON.stringify(list(snapshot.perAsset)),
    });
  }
  const overrides: OverrideRow[] = [];
  for (const entry of list(state.priceOverrides)) {
    const override = asRecord(entry);
    const asset = str(override?.asset);
    if (!override || asset === null) continue;
    overrides.push({
      document_id: documentId,
      asset,
      price: str(override.price) ?? "0",
      set_at: str(override.setAt) ?? "",
    });
  }
  const labels: AddressLabelRow[] = [];
  for (const entry of list(state.addresses)) {
    const addressEntry = asRecord(entry);
    const address = str(addressEntry?.address);
    if (!addressEntry || address === null) continue;
    labels.push({
      document_id: documentId,
      address,
      label: str(addressEntry.label),
      ens_name: str(addressEntry.ensName),
    });
  }
  const issues: CheckIssueRow[] = [];
  const check = asRecord(state.lastCheck);
  const at = str(check?.at) ?? "";
  list(check?.issues).forEach((entry, seq) => {
    const issue = asRecord(entry);
    if (!issue) return;
    issues.push({
      document_id: documentId,
      seq,
      code: str(issue.code) ?? "",
      severity: str(issue.severity) ?? "WARNING",
      message: str(issue.message) ?? "",
      account_id: str(issue.accountId),
      at,
    });
  });
  return { snapshots, overrides, labels, issues };
}

export function registryRows(documentId: string, global: unknown): AssetRow[] {
  const state = asRecord(global);
  const out: AssetRow[] = [];
  for (const entry of list(state?.assets)) {
    const asset = asRecord(entry);
    const identifier = str(asset?.identifier);
    if (!asset || identifier === null) continue;
    out.push({
      document_id: documentId,
      identifier,
      symbol: str(asset.symbol) ?? "",
      name: str(asset.name) ?? "",
      decimals: num(asset.decimals) ?? 0,
      kind: str(asset.kind) ?? "ERC20",
      chain_id: num(asset.chainId) ?? 1,
      coingecko_id: str(asset.coingeckoId),
      custom: bool(asset.custom),
    });
  }
  return out;
}

export interface PriceIndex {
  latest: LatestPriceRow[];
  history: PricePointRow[];
}

export function priceRows(documentId: string, global: unknown): PriceIndex {
  const state = asRecord(global);
  const latest: LatestPriceRow[] = [];
  for (const entry of list(state?.latest)) {
    const price = asRecord(entry);
    const asset = str(price?.asset);
    if (!price || asset === null) continue;
    latest.push({
      document_id: documentId,
      asset,
      price: str(price.price) ?? "0",
      source: str(price.source) ?? "",
      fetched_at: str(price.fetchedAt) ?? "",
    });
  }
  const history: PricePointRow[] = [];
  for (const entry of list(state?.history)) {
    const point = asRecord(entry);
    const asset = str(point?.asset);
    const hour = str(point?.hour);
    if (!point || asset === null || hour === null) continue;
    history.push({
      document_id: documentId,
      asset,
      hour,
      price: str(point.price) ?? "0",
      source: str(point.source) ?? "",
    });
  }
  return { latest, history };
}

export interface StakingIndex {
  validators: ValidatorRow[];
  balances: BalancePointRow[];
  withdrawals: WithdrawalRow[];
}

export function stakingRows(documentId: string, global: unknown): StakingIndex {
  const state = asRecord(global);
  const validators: ValidatorRow[] = [];
  for (const entry of list(state?.validators)) {
    const validator = asRecord(entry);
    const index = num(validator?.index);
    if (!validator || index === null) continue;
    validators.push({
      document_id: documentId,
      validator_index: index,
      public_key: str(validator.publicKey) ?? "",
      withdrawal_address: str(validator.withdrawalAddress),
      activation_ts: num(validator.activationTimestamp),
      exited_ts: num(validator.exitedTimestamp),
      withdrawable_ts: num(validator.withdrawableTimestamp),
    });
  }
  const balances: BalancePointRow[] = [];
  for (const entry of list(state?.balanceHistory)) {
    const point = asRecord(entry);
    const index = num(point?.validatorIndex);
    const day = str(point?.day);
    if (!point || index === null || day === null) continue;
    balances.push({
      document_id: documentId,
      validator_index: index,
      day,
      balance_gwei: str(point.balanceGwei) ?? "0",
    });
  }
  const withdrawals: WithdrawalRow[] = [];
  for (const entry of list(state?.withdrawals)) {
    const withdrawal = asRecord(entry);
    const ref = num(withdrawal?.withdrawalRef);
    if (!withdrawal || ref === null) continue;
    withdrawals.push({
      document_id: documentId,
      withdrawal_ref: ref,
      validator_index: num(withdrawal.validatorIndex) ?? 0,
      amount_gwei: str(withdrawal.amountGwei) ?? "0",
      block_number: num(withdrawal.blockNumber) ?? 0,
      timestamp: str(withdrawal.timestamp) ?? "",
    });
  }
  return { validators, balances, withdrawals };
}

/**
 * Compare rows already stored with the state's rows: rows that left the
 * document are deleted, new and changed ones returned to write, unchanged
 * ones skipped - a categorisation rewrites one row, not ten thousand.
 */
export function planDiff<T extends object, K>(
  stored: T[],
  incoming: T[],
  key: (row: T) => K,
): { deletes: K[]; writes: T[] } {
  const storedByKey = new Map(stored.map((row) => [key(row), row]));
  const incomingKeys = new Set(incoming.map(key));
  const deletes: K[] = [];
  for (const k of storedByKey.keys()) {
    if (!incomingKeys.has(k)) deletes.push(k);
  }
  const writes: T[] = [];
  for (const row of incoming) {
    const previous = storedByKey.get(key(row));
    if (previous === undefined || !sameJson(previous, row)) writes.push(row);
  }
  return { deletes, writes };
}

const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The dispatcher hands the whole state envelope; the row builders read the
 * global state itself.
 */
export function unwrapState(state: unknown): unknown {
  const envelope = asRecord(state);
  const global = envelope ? asRecord(envelope.global) : null;
  return global ?? state;
}
