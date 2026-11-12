/**
 * The drive app's root: the portfolio drawer shell. An open document's
 * editor (children) owns the screen; the drive's own view is Setup until
 * its singletons exist, then the drawer. Pages address through search
 * (?page=, legacy ?tab=): Connect's chrome links here, and the
 * `/d/<drive>/<page>` path form rewrites to it (route file of the same
 * name).
 */
import {
  getDriveName,
  useNodesInSelectedDrive,
  useSelectedDrive,
  useSetPHAppConfig,
  useSetSearchParams,
} from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useState } from "react";
import {
  AccountsSection,
  AssetsSection,
  DashboardSection,
  DeFiSection,
  PnlSection,
  PricesSection,
  StakingSection,
  BalancesSection,
  TransactionsSection,
  portfolioNodeId,
} from "./components/sections.js";
import { Setup } from "./components/Setup.js";
import { DriveContents } from "./components/DriveContents.js";
import { FolderTree } from "./components/FolderTree.js";
import { Shell } from "./components/Shell.js";
import { planSetup } from "./lib/setup.js";
import { slug } from "./lib/slugs.js";
import { pageParam, type Page } from "./nav.js";
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
  const { page, tab } = useSearchParams();
  const setSearchParams = useSetSearchParams();
  const active: Page = pageParam({ page, tab }) ?? "dashboard";
  const driveId = drive.header.id;
  const [adding, setAdding] = useState(false);
  // The wizard runs to its own end: the plan turning ready mid-wizard must
  // not yank it away. The decision happens once the drive's nodes have
  // arrived, then sticks until Setup reports itself done.
  const [mode, setMode] = useState<null | "wizard" | "tabs">(null);
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

  const go = (target: Page | "files") => setSearchParams({ page: target });

  return (
    <Shell
      driveName={getDriveName(drive)}
      active={active}
      filesActive={page === "files"}
      onNavigate={go}
      onOpenFiles={() => go("files")}
      onSearchOpen={() => undefined}
    >
      {page === "files" ? (
        <div className="flex h-full">
          <FolderTree />
          <div className="flex-1 overflow-y-auto p-4">
            <DriveContents />
          </div>
        </div>
      ) : (
        <>
          {active === "dashboard" && (
            <DashboardSection driveId={driveId} portfolioNodeId={portfolioNodeId(list)} />
          )}
          {active === "history" && <TransactionsSection driveId={driveId} />}
          {active === "balances" && (
            <BalancesSection
              driveId={driveId}
              onOpenAsset={(assetId) =>
                setSearchParams({ page: "assets", detail: slug(assetId) }, { replace: true })
              }
              onOpenAccount={(address) =>
                setSearchParams({ page: "address-book", detail: slug(address) }, { replace: true })
              }
            />
          )}
          {active === "staking" && <StakingSection driveId={driveId} />}
          {active === "pnl" && <PnlSection driveId={driveId} list={list} />}
          {active === "assets" && <AssetsSection driveId={driveId} list={list} />}
          {active === "prices" && <PricesSection driveId={driveId} list={list} />}
          {active === "defi" && (
            <div className="px-6 pb-6">
              <DeFiSection driveId={driveId} />
            </div>
          )}
          {active === "address-book" && (
            <div className="p-6 text-muted-foreground">
              Address book arrives with its own task.
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

