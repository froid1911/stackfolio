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
import { actions as walletActions } from "document-models/wallet-account/v1";
import type { WalletAccountState } from "document-models/wallet-account/v1";
import { workflowDrift } from "./drift.js";
import type { WorkflowFacts } from "./facts.js";
import type { WorkflowAction, WorkflowSpec } from "./specs.js";
import {
  assetsSpec,
  buildWorkflow,
  disableAction,
  etherscanBackfillSpec,
  hyperliquidSpec,
  liveEtherscanSpec,
  positionsSpec,
  pricesSpec,
  redecodeSpec,
  stakingSpec,
  withdrawalsSpec,
} from "./specs.js";

import {
  providerForChain,
  unsupportedChainMessage,
} from "../../pieces/ethereum/lib/providers.js";

export const PORTFOLIO_TYPE = "stackfolio/portfolio";
export const WALLET_TYPE = "stackfolio/wallet-account";
export const REGISTRY_TYPE = "stackfolio/asset-registry";
export const PROTOCOL_REGISTRY_TYPE = "stackfolio/protocol-registry";
export const PRICE_BOOK_TYPE = "stackfolio/price-book";
export const STAKING_TYPE = "stackfolio/eth-staking";
export const HYPERLIQUID_TYPE = "stackfolio/hyperliquid-account";
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
  /** An ethereum-piece connection this reactor already has, if any. */
  findChainConnection(): Promise<string | null>;
  findReactorConnection(): Promise<string | null>;
  findWallets(): Promise<Array<{ id: string; state: WalletAccountState }>>;
  /**
   * True when `fingerprint` equals what the previous pass saw for `key`:
   * progress stood still, so the workflow behind it has stalled.
   */
  progressFingerprint(key: string, fingerprint: string): boolean;
  /**
   * The first document of `type` in the drive; the drive holds one. The
   * global state rides along: the staking round reads the watched
   * validator indices straight out of it.
   */
  findSingleton(type: string): Promise<{
    id: string;
    name: string;
    state: unknown;
  } | null>;
  /** Portfolio-document actions (RECORD_CHECK, RECORD_RESOURCES). */
  dispatchPortfolio(id: string, actions: Action[]): Promise<void>;
  dispatchWallet(id: string, actions: Action[]): Promise<void>;
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
    // A configured chain connection anywhere on this reactor (the setup
    // wizard writes one with the node's urls) beats creating a blank one.
    connectionId = await io.findChainConnection();
    if (connectionId) {
      recorded.connectionId = connectionId;
      fixes.push({
        code: "CONNECTION_ADOPTED",
        message: "The portfolio adopted this reactor's ethereum connection.",
      });
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
  const protocolRegistry = await io.findSingleton(PROTOCOL_REGISTRY_TYPE);
  const priceBook = await io.findSingleton(PRICE_BOOK_TYPE);
  const staking = await io.findSingleton(STAKING_TYPE);
  const hyperliquid = await io.findSingleton(HYPERLIQUID_TYPE);
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
  if (!protocolRegistry) {
    issues.push({
      code: "MISSING_PROTOCOL_REGISTRY",
      severity: "WARNING",
      subject: null,
      message:
        "No protocol registry in this drive yet; chain events stay generic and DeFi positions stay unseen until one is seeded.",
    });
  }

  const wallets = await io.findWallets();
  const specs: WorkflowSpec[] = [];
  // The progress marker whose silence unmasks a parked workflow: the
  // wallet's scan cursor for a live scan, the backfill cursor for the
  // history walk. A successful run always moves its marker; a park stops
  // it, and a stopped marker is what re-arming looks for.
  const stallKeys = new Map<WorkflowSpec, string>();
  for (const wallet of wallets) {
    if (wallet.state.ignored) continue;
    const chainId = wallet.state.chainId ?? 1;
    const provider = providerForChain(chainId);
    if (provider === null) {
      issues.push({
        code: "UNSUPPORTED_CHAIN",
        severity: "WARNING",
        subject: wallet.id,
        message: `Wallet ${wallet.state.label ?? wallet.state.address ?? wallet.id.slice(0, 8)}: ${unsupportedChainMessage(chainId)}`,
      });
      continue;
    }
    if (
      provider === "bitcoin" &&
      (wallet.state.bitcoinXpub?.trim() ?? "") === "" &&
      (wallet.state.address?.trim() ?? "") === ""
    ) {
      // Chain 0 is also the never-configured value: a wallet with
      // neither an address nor an xpub is empty, not a Bitcoin wallet.
      issues.push({
        code: "INCOMPLETE_WALLET",
        severity: "WARNING",
        subject: wallet.id,
        message: `Wallet ${wallet.id.slice(0, 8)} has no address and no extended public key yet - nothing can be imported until one is set.`,
      });
      continue;
    }
    // With the protocol registry in the drive, the Etherscan walks decode
    // what they fetch; without it they can only file generic rows.
    const decodeRegistryId =
      provider === "etherscan" ? protocolRegistry?.id : undefined;
    const live = liveEtherscanSpec(wallet.id, provider, decodeRegistryId);
    specs.push(live);
    stallKeys.set(live, wallet.state.cursor?.lastRunAt ?? "never");
    let backfill = wallet.state.backfill;
    if (
      provider === "etherscan" &&
      backfill &&
      backfill.state === "DONE" &&
      (backfill.startBlock ?? 0) !== 0
    ) {
      // Source switch: a walk that finished against the local node gets
      // its lifetime re-imported from block 0 through Etherscan - the
      // history a snap-sync walk could not reach. Wallets whose walk
      // already starts at 0 (Etherscan-era) are left alone.
      await io.dispatchWallet(wallet.id, [
        walletActions.setBackfillState({
          state: "NATIVE",
          startBlock: 0,
          nextBlock: 0,
        }),
      ]);
      fixes.push({
        code: "WORKFLOW_REPAIRED",
        message: `${wallet.id.slice(0, 8)} restarts its history from block 0 - Etherscan reaches what the node walk could not.`,
      });
      backfill = { state: "NATIVE", startBlock: 0, nextBlock: 0 };
    }
    if (!backfill || backfill.state !== "DONE") {
      const walk = etherscanBackfillSpec(
        wallet.id,
        provider,
        decodeRegistryId,
      );
      specs.push(walk);
      stallKeys.set(walk, String(backfill?.nextBlock ?? 0));
      continue;
    }
    // History is in. When a registry exists, the wallet's imported rows
    // get one retrofit pass - the same windows over again, this time
    // decoded - armed once and retired by the walk itself at the head.
    if (provider === "etherscan" && protocolRegistry) {
      if (!wallet.state.redecode) {
        await io.dispatchWallet(wallet.id, [
          walletActions.setRedecodeState({
            state: "NATIVE",
            startBlock: 0,
            nextBlock: 0,
          }),
        ]);
        fixes.push({
          code: "REDECODE_ARMED",
          message: `${wallet.id.slice(0, 8)} queues its retrofit: the history is re-walked with the protocol registry, decoded rows replacing the generic ones; review fields and pinned prices ride along.`,
        });
      }
      if (wallet.state.redecode?.state !== "DONE") {
        const retrofit = redecodeSpec(wallet.id, protocolRegistry.id);
        specs.push(retrofit);
        stallKeys.set(retrofit, String(wallet.state.redecode?.nextBlock ?? 0));
      }
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
    // The asset round needs wallets to hold something; an empty portfolio
    // registers nothing.
    if (wallets.some((w) => !w.state.ignored)) {
      specs.push(
        assetsSpec({
          portfolioDocumentId: doc.id,
          registryDocumentId: registry.id,
          priceBookDocumentId: priceBook.id,
          stakingDocumentId: staking?.id ?? "",
          walletDocumentIds: wallets
            .filter((w) => !w.state.ignored)
            .map((w) => w.id),
          ...(protocolRegistry ? { protocolRegistryDocumentId: protocolRegistry.id } : {}),
        }),
      );
    }
  }
  if (staking) {
    const watchedValidators = Array.isArray(
      (staking.state as { validators?: unknown } | null | undefined)?.validators,
    )
      ? (
          (staking.state as { validators: Array<{ index: number }> })
            .validators ?? []
        )
          .map((validator) => validator.index)
          .filter((index) => Number.isInteger(index))
      : [];
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
        validatorIndices: watchedValidators,
        // The beacon resolves withdrawal addresses; only mainnet wallets
        // can have Ethereum validators withdrawing to them.
        withdrawalAddresses: wallets
          .filter((w) => !w.state.ignored && w.state.chainId === 1)
          .map((w) => w.state.address),
      }),
    );
    specs.push(
      withdrawalsSpec(
        staking.id,
        wallets.filter((w) => !w.state.ignored).map((w) => w.id),
      ),
    );
  }
  if (hyperliquid) {
    specs.push(hyperliquidSpec(hyperliquid.id));
  }
  if (protocolRegistry) {
    // The position sweep reads the chain through the local node, so it
    // covers the wallets that node can answer for; the rest are silent,
    // not missing.
    const reachable = wallets
      .filter(
        (w) =>
          !w.state.ignored &&
          (w.state.chainId ?? 1) === 1 &&
          /^0x[0-9a-fA-F]{40}$/.test(w.state.address ?? ""),
      )
      .map((w) => ({
        address: (w.state.address).toLowerCase(),
        chainId: 1,
      }));
    if (reachable.length > 0) {
      specs.push(positionsSpec(doc.id, protocolRegistry.id, reachable));
    }
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
      // Two documents claiming one spec key (a creation race from two
      // passes): the later one is switched off and leaves the record,
      // so the schedule runs once.
      if (owned.has(workflow.name)) {
        if (workflow.facts.status === "ENABLED") {
          await io.updateWorkflow(id, [disableAction()]);
          fixes.push({
            code: "WORKFLOW_DISABLED",
            message: `${workflow.name} was claimed twice; the duplicate was switched off.`,
          });
        }
        continue;
      }
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
      stallKeys.has(spec) &&
        io.progressFingerprint(spec.key, stallKeys.get(spec) as string),
    );
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
