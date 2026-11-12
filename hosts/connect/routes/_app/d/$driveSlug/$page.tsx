/**
 * The portfolio drive's views, routed under Connect: every page owns a URL
 * (/d/<drive>/<page>), so Back, reloads and deep links land where they
 * say. The route reuses core's drive loader (its own handler over core's
 * exports): slug-or-id resolves, unknown drives 404. The wizard gates an
 * unfinished drive exactly as the drive app did.
 */
import type {
  ConnectRouterContext,
  DriveLoaderOptions,
  DriveRouteData,
} from "@powerhousedao/connect-core/router";
import {
  coreRouteOptions,
  DRIVE_PENDING_MS,
  DrivePending,
  driveTitle,
  loadDrive,
} from "@powerhousedao/connect-core/router";
import {
  getDriveName,
  useDriveById,
  useDriveNodes,
  useSetPHAppConfig,
} from "@powerhousedao/reactor-browser";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import {
  AssetsSection,
  DashboardSection,
  DeFiSection,
  PnlSection,
  PricesSection,
  StakingSection,
  TransactionsSection,
  portfolioNodeId,
} from "editors/stackfolio/components/sections.js";
import { DriveContents } from "editors/stackfolio/components/DriveContents.js";
import { FolderTree } from "editors/stackfolio/components/FolderTree.js";
import { Setup } from "editors/stackfolio/components/Setup.js";
import { Shell } from "editors/stackfolio/components/Shell.js";
import { planSetup } from "editors/stackfolio/lib/setup.js";
import { isPage, type Page } from "editors/stackfolio/nav";
import { editorConfig } from "editors/stackfolio/config";

/** The portfolio page route under core's drive layout: core's loader,
 * with the node route's canonical-URL effect dropped — pages, not drive
 * nodes, are what this URL addresses. */
export const Route = createFileRoute("/_app/d/$driveSlug/$page")({
  ...coreRouteOptions({
    loader: {
      handler: (options: DriveLoaderOptions): Promise<DriveRouteData> =>
        loadDrive(options) as unknown as Promise<DriveRouteData>,
      staleReloadMode: "blocking" as const,
    },
    shouldReload: ({ cause }: { cause: "preload" | "enter" | "stay" }) =>
      cause !== "stay",
    preloadStaleTime: 0,
    pendingMs: DRIVE_PENDING_MS,
    pendingMinMs: 0,
    pendingComponent: DrivePending,
    head: ({
      match,
      loaderData,
    }: {
      match: { context: ConnectRouterContext };
      loaderData?: DriveRouteData;
    }) => ({
      meta: [
        {
          title: loaderData?.driveId
            ? driveTitle(match.context.store, loaderData, match.context.appName)
            : (match.context.appName ?? "Connect"),
        },
      ],
    }),
  }),
  component: PageRoute,
});

function PageRoute() {
  // The tree's param typing for a new sibling under $driveSlug lags the
  // generator in this install; the URL's $page is ours by construction.
  const { driveSlug, page } = useParams({
    strict: false,
  }) as { driveSlug: string; page?: string };
  const navigate = useNavigate();
  useSetPHAppConfig(editorConfig);

  // The loader resolved the URL to a drive id; everything below reads
  // THAT drive, never "the selected one" — a deep link must show the
  // linked drive even when another drive is open elsewhere.
  const loaderData = Route.useLoaderData() as DriveRouteData | undefined;
  const [drive] = useDriveById(loaderData?.driveId);
  const nodes = useDriveNodes(drive?.header.id);
  const list = nodes ?? [];
  const driveId = drive?.header.id;
  const plan = planSetup(
    list.map((n) => ({ kind: n.kind as "file" | "folder", id: n.id })),
    (id: string) => {
      const node = list.find((c) => c.id === id);
      return node && "documentType" in node
        ? (node as { documentType?: string }).documentType
        : undefined;
    },
  );

  const go = (target: string) =>
    void navigate({ href: `/d/${driveSlug}/${target}` });

  const active: Page | "files" = isPage(page) ? page : "files";

  const body =
    !drive || !driveId ? (
      <div className="p-6 text-muted-foreground">Loading the drive…</div>
    ) : !plan.ready ? (
      <Setup onReady={() => go("dashboard")} />
    ) : active === "files" ? (
      <div className="flex h-full">
        <FolderTree />
        <div className="flex-1 overflow-y-auto p-4">
          <DriveContents />
        </div>
      </div>
    ) : (
      <>
        {active === "dashboard" && (
          <DashboardSection
            driveId={driveId}
            portfolioNodeId={portfolioNodeId(list)}
          />
        )}
        {active === "history" && <TransactionsSection driveId={driveId} />}
        {active === "staking" && <StakingSection driveId={driveId} />}
        {active === "pnl" && <PnlSection driveId={driveId} list={list} />}
        {active === "assets" && <AssetsSection driveId={driveId} list={list} />}
        {active === "prices" && <PricesSection driveId={driveId} list={list} />}
        {active === "defi" && (
          <div className="px-6 pb-6">
            <DeFiSection driveId={driveId} />
          </div>
        )}
        {active === "balances" && (
          <div className="p-6 text-muted-foreground">
            Balances arrives with its own task.
          </div>
        )}
        {active === "address-book" && (
          <div className="p-6 text-muted-foreground">
            Address book arrives with its own task.
          </div>
        )}
      </>
    );

  return (
    <Shell
      driveName={drive ? getDriveName(drive) : "…"}
      active={active === "files" ? "dashboard" : active}
      filesActive={active === "files"}
      onNavigate={(p: Page) => go(p)}
      onOpenFiles={() => go("files")}
      onSearchOpen={() => undefined}
    >
      {body}
    </Shell>
  );
}
