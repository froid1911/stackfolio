/**
 * The drive app's root: a tab shell over the portfolio's views. An open
 * document's editor (children) owns the screen; the drive's own view is
 * Setup until its singletons exist, then the tabs.
 */
import {
  getDriveName,
  useNodesInSelectedDrive,
  useDocumentById,
  useSelectedDrive,
  useSetPHAppConfig,
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
import { AddAccountForm, Setup } from "./components/Setup.js";
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
  const [wizard, setWizard] = useState<boolean | null>(null);
  // null: undecided — tabs when the drive is ready or the wizard finished;
  // Setup while it is not. Once started, the wizard stays until it says so.
  const showWizard = wizard ?? (nodes ? !plan.ready : null);

  if (children) return <div className="h-full w-full">{children}</div>;

  if (showWizard === null) {
    return <div className="p-6 text-muted-foreground">Loading the drive…</div>;
  }
  if (showWizard) {
    return (
      <div className="h-full w-full">
        <Setup onReady={() => setWizard(false)} />
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
    </div>
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
  const [filter, setFilter] = useState<EventsFilter>({ ignored: false, first: 50 });
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
  return (
    <Staking
      validators={validators}
      balances={balances}
      withdrawals={withdrawals}
      picked={picked}
      setPicked={setPicked}
      now={now}
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
  const [doc] = useDocumentById(portfolioNodeId(list) ?? "");
  const currency =
    (doc as { global?: { baseCurrency?: string } } | undefined)?.global?.baseCurrency ?? "EUR";
  return <Assets assets={assets} prices={prices} snapshots={snapshots} currency={currency} />;
}

function PricesSection({ driveId, list }: { driveId: string; list: { kind: string; id: string; documentType?: string }[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const assets = useAssets(driveId);
  const latest = useLatestPrices(driveId);
  const overrides = useOverrides(driveId);
  const history = usePriceHistory(driveId, picked);
  const [doc] = useDocumentById(portfolioNodeId(list) ?? "");
  const currency =
    (doc as { global?: { baseCurrency?: string } } | undefined)?.global?.baseCurrency ?? "EUR";
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
