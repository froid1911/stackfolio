import {
  useDocumentById,
  useDocumentSafe,
  useNodesInSelectedDrive,
  useSearchParams,
  useSetSearchParams,
} from "@powerhousedao/reactor-browser";
import {
  useAccounts,
  useAssets,
  useEventsPage,
  useIssues,
  useHoldings,
  useLatestPrices,
  useOverrides,
  usePriceHistory,
  useSnapshots,
  useStakingBalances,
  useTotals,
  useValidators,
  useWithdrawals,
  type BalancesData,
  type EventsFilter,
  type QueryState,
} from "../lib/graphql.js";
import { Accounts } from "./Accounts.js";
import { Balances } from "./Balances.js";
import { ProtocolStack } from "./ProtocolStack.js";
import { buildStack, type Stack } from "../lib/stack.js";
import { buildBalances } from "../../../subgraphs/portfolio-api/lib.js";
import { validatorSummary } from "../lib/staking.js";
import { assetBook } from "../lib/assets.js";
import { Assets } from "./Assets.js";
import { Dashboard, short } from "./Dashboard.js";
import { Prices } from "./Prices.js";
import { Staking } from "./Staking.js";
import { Transactions } from "./Transactions.js";
import { Pnl } from "./Pnl.js";
import {
  DeFi,
  PositionsByProtocol,
  type DocSnapshot,
  type DocWalletPositions,
} from "./DeFi.js";
import { AddAccountForm } from "./Setup.js";
import { AddressBookView } from "./AddressBookView.js";
import { Bundles } from "./Bundles.js";
import { generateId } from "document-model";
import type { Detail } from "../lib/detail.js";
import type { usePortfolioActions } from "../lib/mutations.js";
import { actions as stakingActions } from "document-models/eth-staking";
import { fireWorkflow, useWorkflowByName } from "../lib/workflows.js";
import { useState } from "react";
import { inScope, scoped, useBundleScope, type BundleScope } from "../lib/bundles.js";

/**
 * The page views, lifted from the tab shell so the Connect routes and the
 * drive app share one set of sections. Each section owns its data reads;
 * the shell only picks which one to render.
 */

export function usePortfolioBook(list: { kind: string; id: string; documentType?: string }[]) {
  const { data: doc } = useDocumentSafe(portfolioNodeId(list));
  const global = (
    doc as
      | {
          state?: {
            global?: {
              baseCurrency?: string;
              positions?: unknown;
              snapshots?: { timestamp: string }[];
            };
          };
        }
      | undefined
  )?.state?.global;
  const snapshots = [...(global?.snapshots ?? [])].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  return {
    currency: global?.baseCurrency ?? "EUR",
    positions: (global?.positions ?? []) as DocWalletPositions[],
    latestSnapshot: snapshots.at(-1) as unknown as DocSnapshot | undefined,
  };
}

export function DeFiSection({ driveId }: { driveId: string }) {
  const accounts = useAccounts(driveId);
  const assets = useAssets(driveId);
  const prices = useLatestPrices(driveId);
  const nodes = useNodesInSelectedDrive();
  const book = usePortfolioBook(nodes ?? []);
  const { wallets } = useScope();
  const sweepId = useWorkflowByName("positions-sweep");
  const [sweepStatus, setSweepStatus] = useState("");
  return (
    <div>
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          disabled={sweepId === undefined}
          onClick={() => {
            if (!sweepId) return;
            setSweepStatus("sweeping…");
            fireWorkflow(sweepId)
              .then((run) =>
                setSweepStatus(
                  run.error ? `sweep failed: ${run.error}` : "sweep booked — positions refresh shortly.",
                ),
              )
              .catch((error: unknown) =>
                setSweepStatus(
                  `sweep failed: ${error instanceof Error ? error.message : String(error)}`,
                ),
              );
          }}
          className="rounded border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Sync DeFi positions
        </button>
        {sweepStatus && (
          <span className="text-xs text-muted-foreground">{sweepStatus}</span>
        )}
      </div>
      <DeFi
        positions={scoped(wallets, book.positions, (p) => p.wallet)}
        latestSnapshot={book.latestSnapshot}
        assets={assets.data ?? []}
        prices={prices.data ?? []}
        currency={book.currency}
        walletLabel={(address) =>
          (accounts.data ?? []).find((a) => a.address === address)?.label ||
          short(address)
        }
      />
    </div>
  );
}

export function PnlSection({
  driveId,
  list,
}: {
  driveId: string;
  list: { kind: string; id: string; documentType?: string }[];
}) {
  const accounts = useAccounts(driveId);
  const assets = useAssets(driveId);
  const book = usePortfolioBook(list);
  const setSearchParams = useSetSearchParams();
  const { wallets } = useScope();
  return (
    <Pnl
      driveId={driveId}
      currency={book.currency}
      assets={assets}
      accounts={scopedQuery(accounts, wallets, (a) => a.address)}
      wallets={wallets}
      onOpenEvents={(ids) =>
        setSearchParams({ tab: "transactions", ids: ids.join(",") })
      }
    />
  );
}

/** The wallet bundle the URL names, read from the drive's portfolio. */
export function useScope(): BundleScope {
  const nodes = useNodesInSelectedDrive();
  return useBundleScope(portfolioNodeId(nodes ?? []));
}

/** A list query narrowed to the bundle's wallets. */
function scopedQuery<T>(
  query: QueryState<T[]>,
  wallets: ReadonlySet<string> | null,
  key: (row: T) => string | null | undefined,
): QueryState<T[]> {
  return wallets === null || !query.data
    ? query
    : { ...query, data: scoped(wallets, query.data, key) };
}

/** The events filter's share of a bundle. */
function addressesOf(wallets: ReadonlySet<string> | null): { addresses?: string[] } {
  return wallets === null ? {} : { addresses: [...wallets] };
}

export function portfolioNodeId(
  nodes: { kind: string; id: string; documentType?: string }[],
): string | undefined {
  return nodes.find((n) => n.documentType === "stackfolio/portfolio")?.id;
}

export function DashboardSection({
  driveId,
  portfolioNodeId: id,
}: {
  driveId: string;
  portfolioNodeId: string | undefined;
}) {
  const totals = useTotals(driveId);
  const snapshots = useSnapshots(driveId);
  const { active, wallets } = useScope();
  const accounts = useAccounts(driveId);
  const validators = useValidators(driveId);
  const assets = useAssets(driveId);
  const { stack, walletHoldings } = useStack(driveId);
  const recent = useEventsPage(driveId, { first: 6, ...addressesOf(wallets) });
  // Issues name the wallet document; ones about no wallet stay in view.
  const accountAddress = new Map((accounts.data ?? []).map((a) => [a.documentId, a.address]));
  const allIssues = useIssues(driveId);
  const issues =
    wallets === null || !allIssues.data
      ? allIssues
      : {
          ...allIssues,
          data: allIssues.data.filter(
            (i) => i.accountId === null || inScope(wallets, accountAddress.get(i.accountId)),
          ),
        };
  return (
    <Dashboard
      portfolioDocumentId={id}
      totals={totals}
      snapshots={snapshots}
      recent={recent}
      issues={issues}
      assets={assets}
      holdings={walletHoldings}
      stack={stack}
      bundle={
        active
          ? {
              name: active.name,
              wallets: active.addresses.length,
              validators: scoped(wallets, validators.data ?? [], (v) => v.withdrawalAddress)
                .length,
            }
          : undefined
      }
    />
  );
}

/**
 * The protocol stack for a drive: live holdings, the portfolio's protocol
 * positions and the validators' latest balances, priced with overrides
 * winning — the same precedence the holdings fold uses.
 */
export function useStack(driveId: string): {
  stack: Stack | null;
  currency: string;
  /** Holdings as the stack counts them, in the shape Balances and the Dashboard take. */
  walletHoldings: QueryState<BalancesData | null>;
} {
  const { wallets } = useScope();
  const holdings = useHoldings(driveId);
  const assets = useAssets(driveId);
  const prices = useLatestPrices(driveId);
  const overrides = useOverrides(driveId);
  const nodes = useNodesInSelectedDrive();
  const book = usePortfolioBook(nodes ?? []);
  const validators = scopedQuery(useValidators(driveId), wallets, (v) => v.withdrawalAddress);
  const balances = useStakingBalances(driveId);
  const withdrawals = useWithdrawals(driveId);
  if (!holdings.data || !assets.data || !prices.data) {
    return { stack: null, currency: book.currency, walletHoldings: holdings };
  }
  const priceMap = new Map(prices.data.map((p) => [p.asset, p.price]));
  for (const o of overrides.data ?? []) priceMap.set(o.asset, o.price);
  const stack = buildStack({
    book: assetBook(assets.data, priceMap.keys()),
    prices: priceMap,
    holdings: scoped(wallets, holdings.data.holdings, (r) => r.wallet),
    positions: scoped(wallets, book.positions, (p) => p.wallet),
    validators: (validators.data ?? [])
      .map((v) => ({
        index: v.validatorIndex,
        summary: validatorSummary(v.validatorIndex, balances.data ?? [], withdrawals.data ?? []),
      }))
      .filter((v) => v.summary.rows > 0)
      .map((v) => ({ index: v.index, balanceEth: v.summary.now })),
  });
  const data = holdings.data;
  const counted = new Set(stack.walletRows);
  const rows = data.holdings.filter((r) => counted.has(r));
  const folded = buildBalances(rows);
  const names = new Map(data.perAccount.map((a) => [a.wallet, a]));
  const walletHoldings: QueryState<BalancesData | null> = {
    ...holdings,
    data: {
      holdings: rows,
      perAsset: folded.perAsset.map((a) => ({
        ...a,
        symbol: data.perAsset.find((p) => p.asset === a.asset)?.symbol ?? "",
      })),
      perAccount: folded.perAccount.map((a) => ({
        ...a,
        ensName: names.get(a.wallet)?.ensName ?? null,
        label: names.get(a.wallet)?.label ?? null,
      })),
      total: folded.total,
    },
  };
  return { stack, currency: book.currency, walletHoldings };
}

export function BalancesSection({
  driveId,
  onOpenAsset,
  onOpenAccount,
  onCloseAccount,
}: {
  driveId: string;
  onOpenAsset: (assetId: string) => void;
  onOpenAccount: (address: string) => void;
  onCloseAccount?: () => void;
}) {
  const assets = useAssets(driveId);
  const { stack, currency, walletHoldings } = useStack(driveId);
  return (
    <div>
      <div className="px-6 pt-6">
        {stack ? (
          <ProtocolStack stack={stack} currency={currency} onOpenAsset={onOpenAsset} />
        ) : (
          <p className="text-muted-foreground">Loading where your money sits…</p>
        )}
        <h2 className="mt-8 text-sm font-semibold uppercase text-muted-foreground">
          All assets in wallets
        </h2>
      </div>
      <Balances
        assets={assets}
        holdings={walletHoldings}
        onOpenAsset={onOpenAsset}
        onOpenAccount={onOpenAccount}
        onCloseAccount={onCloseAccount}
      />
    </div>
  );
}

export function TransactionsSection({
  driveId,
  onOpenEvent,
  onOpenAccount,
}: {
  driveId: string;
  onOpenEvent: (eventId: string) => void;
  onOpenAccount: (address: string) => void;
}) {
  const accounts = useAccounts(driveId);
  const assets = useAssets(driveId);
  // A P&L row can pin the view to particular ledger events: ?ids=…
  // The issues sub-tab addresses itself: ?sub=issues, so a sidebar deep
  // link or a shared link lands there directly.
  const { ids, sub } = useSearchParams();
  const setSearchParams = useSetSearchParams();
  const [filter, setFilter] = useState<EventsFilter>(() => ({
    ignored: false,
    first: 50,
    ...(ids
      ? { ids: ids.split(",").filter(Boolean) }
      : {}),
  }));
  const { wallets } = useScope();
  const page = useEventsPage(driveId, { ...filter, ...addressesOf(wallets) });
  const needsPrice = useEventsPage(driveId, {
    needsPrice: true,
    ignored: false,
    first: 1,
    ...addressesOf(wallets),
  });
  const issues = useIssues(driveId);
  return (
    <Transactions
      accounts={scopedQuery(accounts, wallets, (a) => a.address)}
      assets={assets}
      filter={filter}
      setFilter={setFilter}
      page={page}
      sub={sub === "issues" ? "issues" : "events"}
      issues={issues}
      onOpenEvent={onOpenEvent}
      onOpenAccount={onOpenAccount}
      needsPriceCount={needsPrice.data?.total}
      onSub={(next) =>
        setSearchParams(
          (prev) => ({ ...prev, ...(next === "issues" ? { sub: "issues" } : { sub: undefined }) }),
          { replace: true },
        )
      }
    />
  );
}

/**
 * The address book page: the portfolio document's `addresses` entries,
 * edited through the portfolio actions; `?detail=account:<slug>` from
 * the palette/Balances deep-links one entry (highlight) or an unknown
 * address (prefilled add form).
 */
export function AddressBookSection({
  list,
  actions,
  detail,
}: {
  list: { kind: string; id: string; documentType?: string }[];
  actions: ReturnType<typeof usePortfolioActions>;
  detail?: Detail;
}) {
  const { data: doc } = useDocumentSafe(portfolioNodeId(list));
  const global = (
    doc as { state?: { global?: { addresses?: unknown } } } | undefined
  )?.state?.global;
  const { bundles } = useScope();
  const entries = (Array.isArray(global?.addresses) ? global.addresses : []) as Array<{
    id: string;
    address: string;
    chainId: number;
    label?: string | null;
    ensName?: string | null;
    ignored?: boolean;
    addedAt?: string;
  }>;
  return (
    <>
    <AddressBookView
      entries={entries.map((e) => ({
        id: e.id,
        address: e.address,
        chainId: e.chainId,
        label: e.label ?? null,
        ensName: e.ensName ?? null,
        ignored: e.ignored ?? false,
        addedAt: e.addedAt ?? new Date(0).toISOString(),
      }))}
      loading={doc === undefined}
      portfolioReady={actions.ready}
      onAdd={actions.addAddress}
      onUpdate={actions.updateAddress}
      onRemove={actions.removeAddress}
      onIgnore={actions.setAddressIgnored}
      deepLink={
        detail
          ? { address: detail.slug, resolved: detail.id !== undefined }
          : undefined
      }
    />
    <Bundles
      bundles={bundles}
      wallets={[...new Map(entries.map((e) => [e.address, e.label ?? null])).entries()].map(
        ([address, label]) => ({ address, label }),
      )}
      ready={actions.ready}
      newId={generateId}
      onAdd={actions.addBundle}
      onUpdate={actions.updateBundle}
      onRemove={actions.removeBundle}
    />
    </>
  );
}

export function StakingSection({ driveId }: { driveId: string }) {
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const { wallets } = useScope();
  const validators = scopedQuery(useValidators(driveId), wallets, (v) => v.withdrawalAddress);
  // Every validator's rows: the summary cards need them all; the page
  // narrows the chart and the withdrawals list to the picked one itself.
  const balances = useStakingBalances(driveId);
  const withdrawals = useWithdrawals(driveId);
  // One clock per mount; statuses compare against it, not per-render now.
  const [now] = useState(() => Date.now());
  const nodes = useNodesInSelectedDrive();
  const stakingDocumentId = (nodes ?? []).find(
    (node) =>
      "documentType" in node &&
      (node as { documentType?: string }).documentType === "stackfolio/eth-staking",
  )?.id;
  const [, dispatch] = useDocumentById(stakingDocumentId ?? driveId);
  const stakingWorkflowId = useWorkflowByName("staking-daily");
  const [syncStatus, setSyncStatus] = useState("");
  return (
    <Staking
      validators={validators}
      balances={balances}
      withdrawals={withdrawals}
      picked={picked}
      setPicked={setPicked}
      now={now}
      watchEnabled={stakingDocumentId !== undefined}
      onWatch={(index) => {
        if (!stakingDocumentId) return;
        dispatch(
          stakingActions.upsertValidators({
            validators: [
              {
                index,
                publicKey: "",
                withdrawalAddress: null,
                activationTimestamp: null,
                withdrawableTimestamp: null,
                exitedTimestamp: null,
              },
            ],
          }),
          (errors: Error[]) => {
            if (errors[0]) setSyncStatus(errors[0].message);
            else validators.reload();
          },
        );
      }}
      onRemove={(index) => {
        if (!stakingDocumentId) return;
        dispatch(stakingActions.removeValidators({ indices: [index] }), (errors: Error[]) => {
          if (errors[0]) setSyncStatus(errors[0].message);
          else validators.reload();
        });
      }}
      onSync={() => {
        if (!stakingWorkflowId) {
          setSyncStatus("The staking workflow is not published yet.");
          return;
        }
        setSyncStatus("syncing…");
        fireWorkflow(stakingWorkflowId)
          .then((run) =>
            setSyncStatus(
              run.error ? `sync failed: ${run.error}` : "sync booked — balances update in a moment.",
            ),
          )
          .catch((error: unknown) =>
            setSyncStatus(
              `sync failed: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
      }}
      syncStatus={syncStatus}
    />
  );
}

export function AssetsSection({
  driveId,
  list,
  onOpenAsset,
}: {
  driveId: string;
  list: { kind: string; id: string; documentType?: string }[];
  onOpenAsset: (identifier: string) => void;
}) {
  const assets = useAssets(driveId);
  const prices = useLatestPrices(driveId);
  const holdings = useHoldings(driveId);
  const { data: doc } = useDocumentSafe(portfolioNodeId(list));
  const currency =
    (doc as { state?: { global?: { baseCurrency?: string } } } | undefined)?.state?.global
      ?.baseCurrency ?? "EUR";
  const book = usePortfolioBook(list);
  return (
    <div className="grid gap-4">
      <Assets assets={assets} prices={prices} holdings={holdings} currency={currency}
      onOpenAsset={onOpenAsset} />
      {book.positions.length > 0 && (
        <div className="px-6 pb-6">
          <p className="mb-2 text-xs uppercase text-muted-foreground">
            Held inside protocols
          </p>
          <PositionsByProtocol positions={book.positions} assets={assets.data ?? []} />
        </div>
      )}
    </div>
  );
}

export function PricesSection({ driveId, list }: { driveId: string; list: { kind: string; id: string; documentType?: string }[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const assets = useAssets(driveId);
  const latest = useLatestPrices(driveId);
  const overrides = useOverrides(driveId);
  const history = usePriceHistory(driveId, picked);
  const { data: doc } = useDocumentSafe(portfolioNodeId(list));
  const currency =
    (doc as { state?: { global?: { baseCurrency?: string } } } | undefined)?.state?.global
      ?.baseCurrency ?? "EUR";
  return (
    <Prices
      assets={assets}
      latest={latest}
      points={history}
      overrides={overrides}
      picked={picked}
      setPicked={setPicked}
      currency={currency}
    />
  );
}
