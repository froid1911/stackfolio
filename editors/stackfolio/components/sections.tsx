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
import { actions as stakingActions } from "document-models/eth-staking";
import { fireWorkflow, useWorkflowByName } from "../lib/workflows.js";
import { useState } from "react";

/**
 * The page views, lifted from the tab shell so the Connect routes and the
 * drive app share one set of sections. Each section owns its data reads;
 * the shell only picks which one to render.
 */
export function AccountsSection({
  driveId,
  adding,
  setAdding,
}: {
  driveId: string;
  adding: boolean;
  setAdding: (v: boolean) => void;
}) {
  const accounts = useAccounts(driveId);
  const issues = useIssues(driveId);
  const nodes = useNodesInSelectedDrive();
  const portfolioNode = (nodes ?? []).find(
    (node) => "documentType" in node && node.documentType === "stackfolio/portfolio",
  ) as { id: string } | undefined;
  return (
    <div>
      <div className="flex justify-end px-6 pt-4">
        <button
          type="button"
          className="rounded border border-border px-3 py-1 text-sm hover:bg-accent"
          onClick={() => setAdding(!adding)}
        >
          {adding ? "Cancel" : "Add account"}
        </button>
      </div>
      {adding && portfolioNode && (
        <div className="mx-6 mt-2 rounded border border-border p-4">
          <AddAccountForm portfolioId={portfolioNode.id} onDone={() => setAdding(false)} />
        </div>
      )}
      <Accounts accounts={accounts} issues={issues} />
      <div className="px-6 pb-6">
        <DeFiSection driveId={driveId} />
      </div>
    </div>
  );
}

/** Portfolio-document state the DeFi views read directly: positions the
 * reconciler fetched and the newest snapshot's liabilities.
 * useDocumentSafe RETRIEVES the document into the cache and subscribes;
 * useDocumentById only reads documents the app already opened, and the
 * drive app never opens the portfolio document itself. */
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
  const recent = useEventsPage(driveId, { first: 6 });
  return (
    <Dashboard
      portfolioDocumentId={id}
      totals={totals}
      snapshots={snapshots}
      recent={recent}
      issues={issues}
      assets={assets}
    />
  );
}

export function TransactionsSection({ driveId }: { driveId: string }) {
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
      onSub={(next) =>
        setSearchParams(
          (prev) => ({ ...prev, ...(next === "issues" ? { sub: "issues" } : { sub: undefined }) }),
          { replace: true },
        )
      }
    />
  );
}

export function StakingSection({ driveId }: { driveId: string }) {
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const validators = useValidators(driveId);
  const balances = useStakingBalances(driveId, picked);
  const withdrawals = useWithdrawals(driveId, picked);
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
}: {
  driveId: string;
  list: { kind: string; id: string; documentType?: string }[];
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
      <Assets assets={assets} prices={prices} snapshots={snapshots} currency={currency} />
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
