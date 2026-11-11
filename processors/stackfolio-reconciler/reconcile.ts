/**
 * One portfolio, one pass: make the drive hold what the portfolio asks for -
 * the chain connection, and a live-scan / backfill / prices / staking
 * workflow for what the portfolio's wallets and options imply - and write
 * back what was built, found and fixed. The pass dispatches nothing of the
 * chain itself: it reports through `io`, which the processor implements on
 * the reactor host. It acts only on re-read state, never on an operation's
 * payload: replaying the same state does nothing again.
 */
import type { Action } from "document-model";
import { actions as portfolioActions } from "document-models/portfolio/v1";
import type { PortfolioState } from "document-models/portfolio/v1";
import type { WalletAccountState } from "document-models/wallet-account/v1";
import { workflowDrift } from "./drift.js";
import type { WorkflowFacts } from "./facts.js";
import type { WorkflowAction, WorkflowSpec } from "./specs.js";
import {
  buildWorkflow,
  disableAction,
  liveScanSpec,
  nativeBackfillSpec,
  pricesSpec,
  stakingSpec,
} from "./specs.js";

export const PORTFOLIO_TYPE = "stackfolio/portfolio";
export const WALLET_TYPE = "stackfolio/wallet-account";
export const REGISTRY_TYPE = "stackfolio/asset-registry";
export const PRICE_BOOK_TYPE = "stackfolio/price-book";
export const STAKING_TYPE = "stackfolio/eth-staking";
export const CONNECTION_TYPE = "powerhouse/connection";

/** What the pass could not do; `subject` names the document, if any. */
export type Issue = {
  code: string;
  severity: "BLOCKING" | "WARNING";
  subject: string | null;
  message: string;
};

/** What the pass changed, in the user's words. */
export type Fix = { code: string; message: string };

/**
 * What this processor recorded and the read may not show yet (a replay
 * must not build it twice): the ids written by the last pass.
 */
export type Recorded = {
  connectionId: string | null;
  workflowIds: string[];
};

export type ReconcileIO = {
  now(): string;
  newId(): string;
  /** The reactor piece's installed version; steps run against it. */
  reactorPieceVersion(): string;
  /** null: unreadable or deleted. The document's name is its spec key. */
  readWorkflow(
    id: string,
  ): Promise<{ name: string; facts: WorkflowFacts } | null>;
  /** Creates the document named `key` and dispatches `actions` on it. */
  createWorkflow(key: string, actions: WorkflowAction[]): Promise<string>;
  updateWorkflow(id: string, actions: WorkflowAction[]): Promise<void>;
  /** The connection, or null when it is gone or revoked. */
  readConnection(id: string): Promise<{ status: string | null } | null>;
  createChainConnection(name: string): Promise<string>;
  findReactorConnection(): Promise<string | null>;
  findWallets(): Promise<Array<{ id: string; state: WalletAccountState }>>;
  /** The first document of `type` in the drive; the drive holds one. */
  findSingleton(type: string): Promise<{ id: string; name: string } | null>;
  /** Portfolio-document actions (RECORD_CHECK, RECORD_RESOURCES). */
  dispatchPortfolio(id: string, actions: Action[]): Promise<void>;
};



const issueSignature = (
  issues: Array<{ code: string; subject: string | null }>,
): string =>
  issues
    .map((i) => `${i.code}:${i.subject ?? ""}`)
    .sort()
    .join(",");

/**
 * One pass for one portfolio. `recorded` is the processor's overlay of ids
 * this process wrote and the read may not have caught up with; the pass
 * updates it as it goes.
 */
export async function reconcilePortfolio(
  doc: { id: string; name: string; state: PortfolioState },
  recorded: Recorded,
  io: ReconcileIO,
): Promise<void> {
  const s = doc.state;
  const issues: Issue[] = [];
  const fixes: Fix[] = [];

  // The grant: without a person recorded here the pass never publishes.
  // The runtime gives work to a workflow published by nobody, and that is
  // not a thing this reconciler starts.
  const granted = s.grant !== null && s.grant !== undefined;
  if (!granted) {
    issues.push({
      code: "NO_GRANT",
      severity: "BLOCKING",
      subject: null,
      message:
        "Nobody has authorised this portfolio yet. Finish the setup " +
        "wizard to record who it runs for; until then workflows wait as drafts.",
    });
  }

  const reactorConnectionId = await io.findReactorConnection();
  if (!reactorConnectionId) {
    issues.push({
      code: "REACTOR_CONNECTION",
      severity: "BLOCKING",
      subject: null,
      message:
        "This reactor has no Powerhouse connection. Sign in from Connect " +
        "once; workflows that read and write documents wait for it.",
    });
  }

  // The chain connection: what the record points at, or a new one.
  let connectionId = s.resources?.connectionId ?? recorded.connectionId;
  if (connectionId) {
    const connection = await io.readConnection(connectionId);
    if (!connection || connection.status === "REVOKED") {
      fixes.push({
        code: "CONNECTION_REPLACED",
        message: "The chain connection was gone, so it was rebuilt.",
      });
      connectionId = null;
    }
  }
  if (!connectionId) {
    connectionId = await io.createChainConnection(`${doc.name} node`);
    recorded.connectionId = connectionId;
    fixes.push({
      code: "CONNECTION_CREATED",
      message: "The chain connection for this portfolio was created.",
    });
  }

  const registry = await io.findSingleton(REGISTRY_TYPE);
  const priceBook = await io.findSingleton(PRICE_BOOK_TYPE);
  const staking = await io.findSingleton(STAKING_TYPE);
  if (!registry) {
    issues.push({
      code: "MISSING_REGISTRY",
      severity: "WARNING",
      subject: null,
      message:
        "No asset registry in this drive yet; the setup wizard creates one.",
    });
  }
  if (!priceBook) {
    issues.push({
      code: "MISSING_PRICE_BOOK",
      severity: "WARNING",
      subject: null,
      message: "No price book in this drive yet; the setup wizard creates one.",
    });
  }

  const wallets = await io.findWallets();
  const specs: WorkflowSpec[] = [];
  for (const wallet of wallets) {
    if (wallet.state.ignored) continue;
    specs.push(liveScanSpec(wallet.id));
    if (wallet.state.backfill && wallet.state.backfill.state !== "DONE") {
      specs.push(nativeBackfillSpec(wallet.id));
    }
  }
  if (registry && priceBook) {
    specs.push(
      pricesSpec({
        portfolioDocumentId: doc.id,
        registryDocumentId: registry.id,
        priceBookDocumentId: priceBook.id,
        stakingDocumentId: staking?.id ?? "",
        walletDocumentIds: wallets
          .filter((w) => !w.state.ignored)
          .map((w) => w.id),
      }),
    );
  }
  if (staking) {
    specs.push(
      stakingSpec({
        portfolioDocumentId: doc.id,
        registryDocumentId: registry?.id ?? "",
        priceBookDocumentId: priceBook?.id ?? "",
        stakingDocumentId: staking.id,
        walletDocumentIds: wallets
          .filter((w) => !w.state.ignored)
          .map((w) => w.id),
        autoSnapshotEnabled: s.autoSnapshot.enabled,
      }),
    );
  }

  // Every spec has at least one step that reads or writes documents, and
  // those steps only get reactor access with a connection bound. Without
  // one, nothing is buildable: the specs wait.
  const buildable = reactorConnectionId ? specs : [];
  for (const spec of specs) {
    if (!buildable.includes(spec)) {
      issues.push({
        code: "WORKFLOW_WAITING",
        severity: "WARNING",
        subject: spec.key,
        message: `${spec.displayName} waits for the Powerhouse connection.`,
      });
    }
  }

  const connections = {
    ethereum: connectionId,
    reactor: reactorConnectionId ?? "",
  };
  const newId = () => io.newId();

  // The workflows this portfolio owns, by the document name (the spec key).
  const ownedIds = [
    ...new Set([
      ...(s.resources?.workflowIds ?? []),
      ...recorded.workflowIds,
    ]),
  ];
  const owned = new Map<string, { id: string; facts: WorkflowFacts }>();
  const allIds = new Set<string>();
  for (const id of ownedIds) {
    const workflow = await io.readWorkflow(id);
    if (workflow) {
      owned.set(workflow.name, { id, facts: workflow.facts });
      allIds.add(id);
    }
    // Unreadable (deleted): the id drops out of the record; the spec is
    // rebuilt as a fresh document below.
  }

  for (const spec of buildable) {
    const existing = owned.get(spec.key);
    if (!existing) {
      let actions = buildWorkflow(
        spec,
        newId,
        io.now(),
        connections,
        io.reactorPieceVersion(),
      );
      if (!granted) {
        actions = actions.filter(
          (a) => a.type !== "PUBLISH_WORKFLOW" && a.type !== "SET_POLICY",
        );
      }
      const id = await io.createWorkflow(spec.key, actions);
      allIds.add(id);
      fixes.push({
        code: granted ? "WORKFLOW_BUILT" : "WORKFLOW_DRAFTED",
        message: granted
          ? `${spec.displayName} was built and published.`
          : `${spec.displayName} was built; it publishes when the portfolio is granted.`,
      });
      continue;
    }

    const drift = workflowDrift(
      spec,
      existing.facts,
      io.now(),
      newId,
      connections,
      io.reactorPieceVersion(),
    );
    if (drift.differences.some((d) => d.includes("edited by hand"))) {
      issues.push({
        code: "WORKFLOW_STUCK",
        severity: "WARNING",
        subject: existing.id,
        message: drift.differences[0],
      });
      continue;
    }
    if (drift.actions.length === 0) continue;
    let actions = drift.actions;
    if (!granted) {
      actions = actions.filter(
        (a) => a.type !== "PUBLISH_WORKFLOW" && a.type !== "SET_POLICY",
      );
      if (actions.length === 0) continue;
    }
    await io.updateWorkflow(existing.id, actions);
    fixes.push({ code: "WORKFLOW_REPAIRED", message: drift.differences.join(" ") });
  }

  // Owned workflows the portfolio no longer wants: switched off and left
  // in place, so a person can read why they went quiet.
  const wanted = new Set(buildable.map((spec) => spec.key));
  for (const [key, entry] of owned) {
    if (wanted.has(key)) continue;
    if (entry.facts.status === "ENABLED") {
      await io.updateWorkflow(entry.id, [disableAction()]);
      fixes.push({
        code: "WORKFLOW_DISABLED",
        message: `${entry.facts.name ?? key} is not part of this portfolio any more, so it was switched off.`,
      });
    }
  }

  // Write back what the portfolio owns when the set moved (the overlay
  // covers what the read has not caught up with).
  const workflowIds = [...allIds].sort();
  const currentIds = s.resources?.workflowIds ?? [];
  const resourcesMoved =
    workflowIds.length !== currentIds.length ||
    workflowIds.some((id, i) => currentIds.slice().sort()[i] !== id) ||
    (recorded.connectionId !== null &&
      recorded.connectionId !== s.resources?.connectionId);
  if (resourcesMoved) {
    recorded.connectionId = connectionId;
    recorded.workflowIds = workflowIds;
    await io.dispatchPortfolio(doc.id, [
      portfolioActions.recordResources({
        connectionId,
        workflowIds,
      }),
    ]);
  }

  // The check: fixes always land; a bare issue list lands when it changed.
  const sameIssues =
    fixes.length === 0 &&
    !!s.lastCheck &&
    issueSignature(
      s.lastCheck.issues.map((i) => ({
        code: i.code,
        subject: i.accountId ?? null,
      })),
    ) === issueSignature(issues);
  if (!sameIssues) {
    const at = io.now();
    await io.dispatchPortfolio(doc.id, [
      portfolioActions.recordCheck({
        at,
        issues: issues.map((i) => ({
          code: i.code,
          message: i.message,
          severity: i.severity,
          ...(i.subject ? { accountId: i.subject } : {}),
        })),
        fixes: fixes.map((f) => ({
          at,
          code: f.code,
          message: f.message,
        })),
      }),
    ]);
  }
}
