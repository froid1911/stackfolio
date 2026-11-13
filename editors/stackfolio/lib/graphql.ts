import { useEffect, useMemo, useState } from "react";
import { useDocumentSafe } from "@powerhousedao/reactor-browser";
import { gql } from "./gql.js";

/**
 * Typed reads of the portfolio index, one hook per view. The index answers
 * rows for every drive the switchboard knows; every hook passes the drive
 * and the server-side query keeps only that drive's documents' rows.
 */

export interface AccountRow {
  documentId: string;
  address: string;
  chainId: number;
  label: string | null;
  ignored: boolean;
  lastLogsBlock: number | null;
  lastNativeScanBlock: number | null;
  lastRunAt: string | null;
  backfillState: string | null;
  nativeBalance: string | null;
  nativeBalanceBlock: number | null;
}

export interface EventRow {
  documentId: string;
  eventId: string;
  eventIdentifier: string;
  sequenceIndex: number;
  timestamp: string;
  type: string;
  subtype: string;
  asset: string;
  amount: string;
  counterparty: string | null;
  counterpartyLabel: string | null;
  notes: string | null;
  ignored: boolean;
  source: string;
  address: string;
  chainId: number;
  label: string | null;
  /** The books' price per whole unit for this leg; null when it has none. */
  price: string | null;
  priceUnit: string | null;
  priceSource: string | null;
}

export interface EventsPage {
  rows: EventRow[];
  total: number;
}

export interface EventsFilter {
  /** Ledger event ids to pin; the deep link from the P&L page. */
  ids?: string[];
  address?: string;
  asset?: string;
  types?: string[];
  ignored?: boolean;
  from?: string;
  to?: string;
  query?: string;
  /** Only events the books cannot value yet. */
  needsPrice?: boolean;
  first?: number;
  offset?: number;
}

export interface Totals {
  events: number;
  accounts: number;
  validators: number;
  openIssues: number;
  totalValue: string | null;
  snapshotAt: string | null;
}

export interface Snapshot {
  documentId: string;
  id: string;
  timestamp: string;
  totalValue: string;
  locations: { location: string; value: string }[];
  assets: { asset: string; amount: string; value: string }[];
}

export interface Issue {
  documentId: string;
  seq: number;
  code: string;
  severity: string;
  message: string;
  accountId: string | null;
  at: string;
}

export interface Validator {
  documentId: string;
  validatorIndex: number;
  publicKey: string;
  withdrawalAddress: string | null;
  activationTs: number | null;
  exitedTs: number | null;
  withdrawableTs: number | null;
}

export interface StakingBalance {
  documentId: string;
  validatorIndex: number;
  day: string;
  balanceGwei: string;
}

export interface Withdrawal {
  documentId: string;
  withdrawalRef: number;
  validatorIndex: number;
  amountGwei: string;
  blockNumber: number;
  timestamp: string;
}

export interface Asset {
  documentId: string;
  identifier: string;
  symbol: string;
  name: string;
  decimals: number;
  kind: string;
  chainId: number;
  coingeckoId: string | null;
  custom: boolean;
}

export interface Price {
  asset: string;
  price: string;
  source: string;
  fetchedAt: string;
}

export interface PricePoint {
  asset: string;
  hour: string;
  price: string;
}

export interface Override {
  documentId: string;
  asset: string;
  price: string;
  setAt: string;
}

export interface AddressLabel {
  documentId: string;
  address: string;
  label: string | null;
  ensName: string | null;
}

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetch once, refetch when the variables change or `reload` is called, and
 * keep the last data on screen while the next answer travels.
 */
export function useIndexQuery<T>(
  query: string,
  variables: Record<string, unknown>,
): QueryState<T> {
  const [state, setState] = useState<{
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const varsKey = JSON.stringify(variables);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    gql<T>(query, JSON.parse(varsKey) as Record<string, unknown>)
      .then((data) => {
        if (live) setState({ data, error: null, loading: false });
      })
      .catch((error: Error) => {
        if (live)
          setState((s) => ({ data: s.data, error: error.message, loading: false }));
      });
    return () => {
      live = false;
    };
    // varsKey stands in for the variables object; query is constant text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, varsKey, tick]);

  return {
    ...state,
    reload: () => setTick((t) => t + 1),
  };
}

const EVENTS_ROWS = `
  documentId eventId eventIdentifier sequenceIndex timestamp type subtype
  asset amount counterparty counterpartyLabel notes ignored source address
  chainId label price priceUnit priceSource
`;

/** Everything `portfolioApi` answers, so a hook is one field name. */
export interface PortfolioApi {
  totals: Totals;
  accounts: AccountRow[];
  issues: Issue[];
  events: EventsPage;
  addressLabels: AddressLabel[];
  snapshots: Snapshot[];
  validators: Validator[];
  stakingBalances: StakingBalance[];
  withdrawals: Withdrawal[];
  assets: Asset[];
  latestPrices: Price[];
  priceHistory: PricePoint[];
  priceOverrides: Override[];
  openLots: Lot[];
  realizedEvents: RealizedEvent[];
  incomeByMonth: Income[];
  pnlReport: PnlBucket[];
  unpricedSummary: Unpriced[];
  hyperliquidAccounts: HyperliquidAccount[];
  holdings: BalancesData;
}

function usePortfolioField<K extends keyof PortfolioApi>(
  query: string,
  variables: Record<string, unknown>,
  field: K,
): QueryState<PortfolioApi[K]> {
  const state = useIndexQuery<{ portfolioApi: PortfolioApi }>(query, variables);
  return {
    data: state.data ? state.data.portfolioApi[field] : null,
    error: state.error,
    loading: state.loading,
    reload: state.reload,
  };
}

export function useTotals(driveId: string): QueryState<Totals> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { totals(driveId: $driveId) { events accounts validators openIssues totalValue snapshotAt } } }`,
    { driveId },
    "totals",
  );
}

export function useAccounts(driveId: string): QueryState<AccountRow[]> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { accounts(driveId: $driveId) { documentId address chainId label ignored lastLogsBlock lastNativeScanBlock lastRunAt backfillState nativeBalance nativeBalanceBlock } } }`,
    { driveId },
    "accounts",
  );
}

export function useIssues(driveId: string): QueryState<Issue[]> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { issues(driveId: $driveId) { documentId seq code severity message accountId at } } }`,
    { driveId },
    "issues",
  );
}

export function useEventsPage(
  driveId: string,
  filter: EventsFilter,
): QueryState<EventsPage> {
  return usePortfolioField(
    `query ($driveId: String! $ids: [String!] $address: String $asset: String $types: [String!] $ignored: Boolean $from: String $to: String $query: String $needsPrice: Boolean $first: Int $offset: Int) {
      portfolioApi {
        events(driveId: $driveId ids: $ids address: $address asset: $asset types: $types ignored: $ignored from: $from to: $to query: $query needsPrice: $needsPrice first: $first offset: $offset) {
          total
          rows { ${EVENTS_ROWS} }
        }
      }
    }`,
    { driveId, ...filter },
    "events",
  );
}

export interface HoldingRow {
  asset: string;
  symbol: string;
  wallet: string;
  quantity: string;
  value: string | null;
}

export interface BalancesData {
  holdings: HoldingRow[];
  perAsset: { asset: string; symbol: string; quantity: string; value: string | null }[];
  perAccount: { wallet: string; ensName: string | null; label: string | null; value: string }[];
  total: string;
}

/** The balances matrix, folded server-side from the drive's ledgers. */
export function useHoldings(driveId: string): QueryState<BalancesData | null> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { holdings(driveId: $driveId) {
      total
      holdings { asset symbol wallet quantity value }
      perAsset { asset symbol quantity value }
      perAccount { wallet ensName label value }
    } } }`,
    { driveId },
    "holdings",
  );
}

/**
 * The address book's addresses straight from the portfolio document —
 * the candidate set for `account:` slugs (deep links). Reactor-browser's
 * cache hook retrieves the document; the read is offline-cheap.
 */
export function usePortfolioAddresses(portfolioDocumentId: string | undefined): string[] {
  const { data } = useDocumentSafe(portfolioDocumentId);
  const addresses = (
    data as
      | { state?: { global?: { addresses?: Array<{ address?: unknown }> } } }
      | undefined
  )?.state?.global?.addresses;
  const ids = (Array.isArray(addresses) ? addresses : [])
    .map((a) => (typeof a.address === "string" ? a.address : ""))
    .filter(Boolean);
  const key = ids.join("\u0000");
  return useMemo(() => (key ? key.split("\u0000") : []), [key]);
}

/**
 * The event ids the history page shows — the candidate set for
 * `event:` slugs. A deep link to an event outside the current page
 * resolves against the FIRST page widened through `ids`: the resolver
 * matches event ids exactly, so fetching with the candidate as an id
 * filter resolves a real id even off-page (see EventDetail's own fetch);
 * the list here covers the common case (rows on screen).
 */
export function useEventIds(driveId: string, enabled: boolean): string[] {
  const page = useEventsPage(driveId, enabled ? { first: 200, ignored: undefined } : { first: 0 });
  const ids = (page.data?.rows ?? []).map((r) => r.eventId);
  const key = ids.join("\u0000");
  return useMemo(() => (key ? key.split("\u0000") : []), [key]);
}

/** Just the registry's identifiers: the candidate set for `asset:` slugs. */
export function useAssetIds(driveId: string): string[] {
  const assets = useAssets(driveId);
  const ids = (assets.data ?? []).map((a) => a.identifier);
  // Stable identity for useDetail's join-key memo.
  const key = ids.join("\u0000");
  return useMemo(() => (key ? key.split("\u0000") : []), [key]);
}

export function useAddressLabels(driveId: string): QueryState<AddressLabel[]> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { addressLabels(driveId: $driveId) { documentId address label ensName } } }`,
    { driveId },
    "addressLabels",
  );
}

export function useSnapshots(
  driveId: string,
  first = 90,
): QueryState<Snapshot[]> {
  return usePortfolioField(
    `query ($driveId: String! $first: Int) { portfolioApi { snapshots(driveId: $driveId first: $first) { documentId id timestamp totalValue locations { location value } assets { asset amount value } } } }`,
    { driveId, first },
    "snapshots",
  );
}

export function useValidators(driveId: string): QueryState<Validator[]> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { validators(driveId: $driveId) { documentId validatorIndex publicKey withdrawalAddress activationTs exitedTs withdrawableTs } } }`,
    { driveId },
    "validators",
  );
}

export function useStakingBalances(
  driveId: string,
  validatorIndex?: number,
): QueryState<StakingBalance[]> {
  return usePortfolioField(
    `query ($driveId: String! $validatorIndex: Int) { portfolioApi { stakingBalances(driveId: $driveId validatorIndex: $validatorIndex) { documentId validatorIndex day balanceGwei } } }`,
    { driveId, validatorIndex },
    "stakingBalances",
  );
}

export function useWithdrawals(
  driveId: string,
  validatorIndex?: number,
): QueryState<Withdrawal[]> {
  return usePortfolioField(
    `query ($driveId: String! $validatorIndex: Int) { portfolioApi { withdrawals(driveId: $driveId validatorIndex: $validatorIndex) { documentId withdrawalRef validatorIndex amountGwei blockNumber timestamp } } }`,
    { driveId, validatorIndex },
    "withdrawals",
  );
}

export function useAssets(driveId: string): QueryState<Asset[]> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { assets(driveId: $driveId) { documentId identifier symbol name decimals kind chainId coingeckoId custom } } }`,
    { driveId },
    "assets",
  );
}

export function useLatestPrices(driveId: string): QueryState<Price[]> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { latestPrices(driveId: $driveId) { asset price source fetchedAt } } }`,
    { driveId },
    "latestPrices",
  );
}

export function usePriceHistory(
  driveId: string,
  asset: string | null,
): QueryState<PricePoint[]> {
  return usePortfolioField(
    `query ($driveId: String! $asset: String) { portfolioApi { priceHistory(driveId: $driveId asset: $asset) { asset hour price } } }`,
    { driveId, asset: asset ?? undefined },
    "priceHistory",
  );
}

export function useOverrides(driveId: string): QueryState<Override[]> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { priceOverrides(driveId: $driveId) { documentId asset price setAt } } }`,
    { driveId },
    "priceOverrides",
  );
}

/** An open cost-basis lot; unit cost is per whole unit, 8 decimals. */
export interface Lot {
  wallet: string;
  asset: string;
  sourceEventId: string;
  sourceSeq: number;
  quantity: string;
  unitCost: string;
}

export interface ConsumedLot {
  sourceEventId: string;
  quantity: string;
  cost: string;
}

export interface RealizedEvent {
  id: string;
  wallet: string;
  asset: string;
  timestamp: string;
  quantity: string;
  cost: string;
  proceeds: string;
  pnl: string;
  sourceEventId: string;
  sourceSeq: number;
  consumed: ConsumedLot[];
}

export interface Income {
  wallet: string;
  bucket: string;
  month: string;
  amount: string;
}

export interface PnlBucket {
  wallet: string;
  month: string;
  income: string;
  expense: string;
  realizedPnl: string;
  unpricedIn: number;
  unpricedOut: number;
}

export interface Unpriced {
  wallet: string;
  month: string;
  inCount: number;
  outCount: number;
}

export interface HyperliquidAccount {
  documentId: string;
  address: string;
  label: string | null;
  accountValueUsd: string | null;
  updatedAt: string | null;
}

export function useOpenLots(
  driveId: string,
  wallet?: string,
): QueryState<Lot[]> {
  return usePortfolioField(
    `query ($driveId: String! $wallet: String) { portfolioApi { openLots(driveId: $driveId wallet: $wallet) { wallet asset sourceEventId sourceSeq quantity unitCost } } }`,
    { driveId, wallet },
    "openLots",
  );
}

export function useRealizedEvents(
  driveId: string,
  window: { from?: string; to?: string; wallet?: string },
): QueryState<RealizedEvent[]> {
  return usePortfolioField(
    `query ($driveId: String! $wallet: String $from: String $to: String) { portfolioApi { realizedEvents(driveId: $driveId wallet: $wallet from: $from to: $to) { id wallet asset timestamp quantity cost proceeds pnl sourceEventId sourceSeq consumed { sourceEventId quantity cost } } } }`,
    { driveId, ...window },
    "realizedEvents",
  );
}

export function useIncomeByMonth(
  driveId: string,
  wallet?: string,
): QueryState<Income[]> {
  return usePortfolioField(
    `query ($driveId: String! $wallet: String) { portfolioApi { incomeByMonth(driveId: $driveId wallet: $wallet) { wallet bucket month amount } } }`,
    { driveId, wallet },
    "incomeByMonth",
  );
}

export function usePnlReport(
  driveId: string,
  window: { from: string; to: string; wallet?: string },
): QueryState<PnlBucket[]> {
  return usePortfolioField(
    `query ($driveId: String! $from: String! $to: String! $wallet: String) { portfolioApi { pnlReport(driveId: $driveId from: $from to: $to grouping: "MONTH" wallet: $wallet) { wallet month income expense realizedPnl unpricedIn unpricedOut } } }`,
    { driveId, ...window },
    "pnlReport",
  );
}

export function useUnpricedSummary(
  driveId: string,
  wallet?: string,
): QueryState<Unpriced[]> {
  return usePortfolioField(
    `query ($driveId: String! $wallet: String) { portfolioApi { unpricedSummary(driveId: $driveId wallet: $wallet) { wallet month inCount outCount } } }`,
    { driveId, wallet },
    "unpricedSummary",
  );
}

export function useHyperliquidAccounts(
  driveId: string,
): QueryState<HyperliquidAccount[]> {
  return usePortfolioField(
    `query ($driveId: String!) { portfolioApi { hyperliquidAccounts(driveId: $driveId) { documentId address label accountValueUsd updatedAt } } }`,
    { driveId },
    "hyperliquidAccounts",
  );
}
