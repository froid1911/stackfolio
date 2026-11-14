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
import { useEffect, useState } from "react";
import {
  AssetsSection,
  DashboardSection,
  DeFiSection,
  PnlSection,
  PricesSection,
  StakingSection,
  BalancesSection,
  TransactionsSection,
  portfolioNodeId,
  usePortfolioBook,
} from "./components/sections.js";
import { AddressBookSection } from "./components/sections.js";
import { AssetDetail } from "./components/AssetDetail.js";
import { EventDetail } from "./components/EventDetail.js";
import { CommandPalette, paletteKeyHandler } from "./components/CommandPalette.js";
import { DetailNotFound } from "./components/DetailNotFound.js";
import { useDetail } from "./lib/detail.js";
import { useAssetIds } from "./lib/graphql.js";
import { usePortfolioActions } from "./lib/mutations.js";
import { useEventIds, usePortfolioAddresses } from "./lib/graphql.js";
import type { SearchHit } from "./lib/search.js";
import { Setup } from "./components/Setup.js";
import { DriveContents } from "./components/DriveContents.js";
import { FolderTree } from "./components/FolderTree.js";
import { Shell } from "./components/Shell.js";
import { BundleSwitcher } from "./components/Bundles.js";
import { useBundleScope } from "./lib/bundles.js";
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The wizard runs to its own end: the plan turning ready mid-wizard must
  // not yank it away. The decision happens once the drive's nodes have
  // arrived, then sticks until Setup reports itself done.
  const [mode, setMode] = useState<null | "wizard" | "tabs">(null);
  if (mode === null && nodes) setMode(plan.ready ? "tabs" : "wizard");
  const activeMode = mode;

  // Every hook runs BEFORE the early returns below - the wizard/loading
  // branch must not change the hook count (React rule; the overlays and
  // the command palette added hooks, so all of it moved up here).
  // The asset detail names a registered asset; match the URL slug
  // against the drive's registry ids (the only candidate set that can
  // resolve it - balances rows are a subset).
  const registryIds = useAssetIds(driveId);
  const portfolioId = portfolioNodeId(list);
  const { currency } = usePortfolioBook(list);
  // The address deep link resolves against the book's addresses (read
  // from the portfolio document's own state).
  const portfolioIds = usePortfolioAddresses(portfolioId);
  const portfolioActions = usePortfolioActions(portfolioId);
  const scope = useBundleScope(portfolioId);
  const eventPageIds = useEventIds(driveId, active === "history");
  const eventDetail = useDetail(
    active === "history" ? "history" : "dashboard",
    eventPageIds,
  );
  const accountBookDetail = useDetail(
    active === "address-book" ? "address-book" : "dashboard",
    portfolioIds,
  );
  const assetDetail = useDetail(active === "assets" || active === "balances" ? active : "dashboard", registryIds);

  // Ctrl/Cmd+K from anywhere; the palette's own Escape closes it (the
  // handler must not close twice through the bubbled event, so it only
  // fires Escape when the palette is open - CommandPalette calls
  // onClose on its own keydown; this listener covers window-level
  // opens from the shortcut and closing when focus is outside).
  useEffect(() => {
    const handler = paletteKeyHandler(paletteOpen, () => setPaletteOpen(true), () =>
      setPaletteOpen(false),
    );
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen]);

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


  // Detail overlays address through ?detail=<kind>:<slug> (lib/detail);
  // closing removes the param, leaving the page - and history intact.
  const closeDetail = () =>
    setSearchParams({ detail: undefined }, { replace: false });

  const goToHit = (hit: SearchHit) => {
    setSearchParams(
      {
        page: hit.to.page,
        detail: hit.to.detail ? `${hit.kind}:${hit.to.detail}` : undefined,
        // A page hit is a fresh page view: drop stale detail/ids state.
        ...(hit.kind === "page" ? { detail: undefined, ids: undefined, sub: undefined } : {}),
      },
      { replace: false },
    );
  };

  return (
    <Shell
      driveName={getDriveName(drive)}
      active={active}
      filesActive={page === "files"}
      onNavigate={go}
      onOpenFiles={() => go("files")}
      onSearchOpen={() => setPaletteOpen(true)}
      headerStart={
        <BundleSwitcher
          bundles={scope.bundles}
          active={scope.active}
          onPick={(bundle) => setSearchParams({ bundle }, { replace: false })}
        />
      }
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
          {active === "history" && (
            <TransactionsSection
              driveId={driveId}
              actions={portfolioActions}
              onOpenEvent={(eventId) =>
                setSearchParams(
                  { page: "history", detail: `event:${slug(eventId)}` },
                  { replace: false },
                )
              }
              onOpenAccount={(address) =>
                setSearchParams(
                  { page: "address-book", detail: `account:${slug(address)}` },
                  { replace: false },
                )
              }
            />
          )}
          {active === "history" && eventDetail && (
            <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[70vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-background p-2 shadow-2xl">
              {eventDetail.id ? (
                <EventDetail
                  driveId={driveId}
                  currency={currency}
                  eventId={eventDetail.id}
                  onClose={closeDetail}
                  onOpenAccount={(address) =>
                    setSearchParams(
                      { page: "address-book", detail: `account:${slug(address)}` },
                      { replace: false },
                    )
                  }
                  onOpenHistory={(ids) =>
                    setSearchParams({ page: "history", ids: ids.join(","), detail: undefined })
                  }
                  onOpenPnl={() => setSearchParams({ page: "pnl", detail: undefined })}
                />
              ) : (
                <DetailNotFound label={eventDetail.slug} onClose={closeDetail} />
              )}
            </div>
          )}
          {active === "balances" && (
            <BalancesSection
              driveId={driveId}
              onOpenAsset={(assetId) =>
                setSearchParams(
                  { page: "balances", detail: `asset:${slug(assetId)}` },
                  { replace: false },
                )
              }
              onOpenAccount={(address) =>
                setSearchParams(
                  { page: "address-book", detail: `account:${slug(address)}` },
                  { replace: false },
                )
              }
              onCloseAccount={closeDetail}
            />
          )}
          {active === "address-book" && (
            <AddressBookSection list={list} actions={portfolioActions} detail={accountBookDetail} />
          )}
          {active === "staking" && <StakingSection driveId={driveId} />}
          {active === "pnl" && <PnlSection driveId={driveId} list={list} />}
          {active === "assets" && (
            <AssetsSection
              driveId={driveId}
              list={list}
              onOpenAsset={(identifier) =>
                setSearchParams(
                  { page: "assets", detail: `asset:${slug(identifier)}` },
                  { replace: false },
                )
              }
            />
          )}
          {(active === "assets" || active === "balances") &&
            assetDetail &&
            (assetDetail.id ? (
              <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[70vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-background p-2 shadow-2xl">
                <AssetDetail
                  driveId={driveId}
                  assetId={assetDetail.id}
                  portfolioId={portfolioNodeId(list)}
                  onClose={closeDetail}
                />
              </div>
            ) : (
              <DetailNotFound label={assetDetail.slug} onClose={closeDetail} />
            ))}
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
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        driveId={driveId}
        onGo={goToHit}
      />
    </Shell>
  );
}

