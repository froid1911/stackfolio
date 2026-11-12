/**
 * The drive app's root: a tab shell over the portfolio's views. An open
 * document's editor (children) owns the screen; the drive's own view is
 * Setup until its singletons exist, then the tabs.
 */
import {
  getDriveName,
  useNodesInSelectedDrive,
  useDocumentById,
  useDocumentSafe,
  useSelectedDrive,
  useSetPHAppConfig,
  useSetSearchParams,
} from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useState } from "react";
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
} from "./lib/graphql.js";
import { planSetup } from "./lib/setup.js";
import { Accounts } from "./components/Accounts.js";
import { Assets } from "./components/Assets.js";
import { Dashboard } from "./components/Dashboard.js";
import { Prices } from "./components/Prices.js";
import { Staking } from "./components/Staking.js";
import { Transactions } from "./components/Transactions.js";
import { Pnl } from "./components/Pnl.js";
import {
  DeFi,
  PositionsByProtocol,
  type DocSnapshot,
  type DocWalletPositions,
} from "./components/DeFi.js";
import { short } from "./components/Dashboard.js";
import { AddAccountForm, Setup } from "./components/Setup.js";
import { actions as stakingActions } from "document-models/eth-staking";
import { fireWorkflow, useWorkflowByName } from "./lib/workflows.js";
import { DriveContents } from "./components/DriveContents.js";
import { FolderTree } from "./components/FolderTree.js";
import { isTab, Nav, type Tab } from "./components/Nav.js";
import { editorConfig } from "./config.js";
import { useSearchParams } from "@powerhousedao/reactor-browser";

export default function Editor({ children }: EditorProps) {
  useSetPHAppConfig(editorConfig);
  const [drive] = useSelectedDrive();
  const nodes = useNodesInSelectedDrive();
  const list = nodes ?? [];
  const plan = planSetup(
    list.map((node) => ({ kind: node.kind as "file" | "folder", id: node.id })),
    (id) => {
      const node = list.find((candidate) => candidate.id === id);
      return node && "documentType" in node
        ? (node as { documentType?: string }).documentType
        : undefined;
    },
  );
  const { tab } = useSearchParams();
  const active: Tab = isTab(tab) ? tab : "dashboard";
  const driveId = drive.header.id;
  const [adding, setAdding] = useState(false);
  // The wizard runs to its own end: the plan turning ready mid-wizard must
  // not yank it away. The decision happens once the drive's nodes have
  // arrived, then sticks until Setup reports itself done.
  // The wizard mode is decided once, on the render where the drive's nodes
  // have arrived, and sticks: the plan turning ready mid-wizard (the book
  // step creates the very singletons the plan checks) must not yank it away.
  const [mode, setMode] = useState<null | "wizard" | "tabs">(null);
  // Latch the decision once, on the render where the drive's nodes arrive.
  // (Render-phase update: React re-runs this render immediately; the wizard
  // then stays up through its own steps even though the book step turns
  // plan.ready on the way.)
  if (mode === null && nodes) setMode(plan.ready ? "tabs" : "wizard");
  const activeMode = mode;

  if (children) return <div className="h-full w-full">{children}</div>;

  if (activeMode === null) {
    return <div className="p-6 text-muted-foreground">Loading the drive…</div>;
  }
  if (activeMode === "wizard") {
    return (
      <div className="h-full w-full">
        <Setup onReady={() => setMode("tabs")} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-4 px-4 py-2">
        <span className="text-sm font-semibold">{getDriveName(drive)}</span>
      </header>
      <Nav />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {active === "accounts" && (
          <AccountsSection driveId={driveId} adding={adding} setAdding={setAdding} />
        )}
        {active === "files" && (
          <div className="flex h-full">
            <FolderTree />
            <div className="flex-1 overflow-y-auto p-4">
              <DriveContents />
            </div>
          </div>
        )}
        {active === "dashboard" && (
          <DashboardSection driveId={driveId} portfolioNodeId={portfolioNodeId(list)} />
        )}
        {active === "transactions" && <TransactionsSection driveId={driveId} />}
        {active === "staking" && <StakingSection driveId={driveId} />}
        {active === "pnl" && <PnlSection driveId={driveId} list={list} />}
        {active === "assets" && <AssetsSection driveId={driveId} list={list} />}
        {active === "prices" && <PricesSection driveId={driveId} list={list} />}
      </div>
    </div>
  );
}

function AccountsSection({
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
function usePortfolioBook(list: { kind: string; id: string; documentType?: string }[]) {
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

function DeFiSection({ driveId }: { driveId: string }) {
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

function PnlSection({
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

function portfolioNodeId(
  nodes: { kind: string; id: string; documentType?: string }[],
): string | undefined {
  return nodes.find((n) => n.documentType === "stackfolio/portfolio")?.id;
}

function DashboardSection({
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

function TransactionsSection({ driveId }: { driveId: string }) {
  const accounts = useAccounts(driveId);
  const assets = useAssets(driveId);
  // A P&L row can pin the view to particular ledger events: ?ids=…
  const { ids } = useSearchParams();
  const [filter, setFilter] = useState<EventsFilter>(() => ({
    ignored: false,
    first: 50,
    ...(ids
      ? { ids: ids.split(",").filter(Boolean) }
      : {}),
  }));
  const page = useEventsPage(driveId, filter);
  return (
    <Transactions
      accounts={accounts}
      assets={assets}
      filter={filter}
      setFilter={setFilter}
      page={page}
    />
  );
}

function StakingSection({ driveId }: { driveId: string }) {
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
          (errors) => {
            if (errors[0]) setSyncStatus(errors[0].message);
            else validators.reload();
          },
        );
      }}
      onRemove={(index) => {
        if (!stakingDocumentId) return;
        dispatch(stakingActions.removeValidators({ indices: [index] }), (errors) => {
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

function AssetsSection({
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

function PricesSection({ driveId, list }: { driveId: string; list: { kind: string; id: string; documentType?: string }[] }) {
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
