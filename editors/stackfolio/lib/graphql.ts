import { useEffect, useState } from "react";
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
}

export interface EventsPage {
  rows: EventRow[];
  total: number;
}

export interface EventsFilter {
  address?: string;
  asset?: string;
  types?: string[];
  ignored?: boolean;
  from?: string;
  to?: string;
  query?: string;
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
  chainId label
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
    `query ($driveId: String! $address: String $asset: String $types: [String!] $ignored: Boolean $from: String $to: String $query: String $first: Int $offset: Int) {
      portfolioApi {
        events(driveId: $driveId address: $address asset: $asset types: $types ignored: $ignored from: $from to: $to query: $query first: $first offset: $offset) {
          total
          rows { ${EVENTS_ROWS} }
        }
      }
    }`,
    { driveId, ...filter },
    "events",
  );
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
