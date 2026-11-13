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
  type EventsFilter,
} from "../lib/graphql.js";
import { Accounts } from "./Accounts.js";
import { Balances } from "./Balances.js";
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
import type { Detail } from "../lib/detail.js";
import type { usePortfolioActions } from "../lib/mutations.js";
import { actions as stakingActions } from "document-models/eth-staking";
import { fireWorkflow, useWorkflowByName } from "../lib/workflows.js";
import { useState } from "react";

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
        positions={book.positions}
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
  return (
    <Pnl
      driveId={driveId}
      currency={book.currency}
      assets={assets}
      accounts={accounts}
      onOpenEvents={(ids) =>
        setSearchParams({ tab: "transactions", ids: ids.join(",") })
      }
    />
  );
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
  const issues = useIssues(driveId);
  const assets = useAssets(driveId);
  const holdings = useHoldings(driveId);
  const recent = useEventsPage(driveId, { first: 6 });
  return (
    <Dashboard
      portfolioDocumentId={id}
      totals={totals}
      snapshots={snapshots}
      recent={recent}
      issues={issues}
      assets={assets}
      holdings={holdings}
    />
  );
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
  const holdings = useHoldings(driveId);
  const assets = useAssets(driveId);
  return (
    <Balances
      assets={assets}
      holdings={holdings}
      onOpenAsset={onOpenAsset}
      onOpenAccount={onOpenAccount}
      onCloseAccount={onCloseAccount}
    />
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
  const page = useEventsPage(driveId, filter);
  const issues = useIssues(driveId);
  return (
    <Transactions
      accounts={accounts}
      assets={assets}
      filter={filter}
      setFilter={setFilter}
      page={page}
      sub={sub === "issues" ? "issues" : "events"}
      issues={issues}
      onOpenEvent={onOpenEvent}
      onOpenAccount={onOpenAccount}
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
  );
}

export function StakingSection({ driveId }: { driveId: string }) {
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const validators = useValidators(driveId);
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
  const snapshots = useSnapshots(driveId);
  const { data: doc } = useDocumentSafe(portfolioNodeId(list));
  const currency =
    (doc as { state?: { global?: { baseCurrency?: string } } } | undefined)?.state?.global
      ?.baseCurrency ?? "EUR";
  const book = usePortfolioBook(list);
  return (
    <div className="grid gap-4">
      <Assets assets={assets} prices={prices} snapshots={snapshots} currency={currency}
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
