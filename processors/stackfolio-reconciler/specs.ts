/**
 * The workflows the reconciler owns, as data: a trigger, a chain of steps
 * and the actions that (re)build them. Pure module - no I/O, no clock, no
 * ids invented except through the `newId` the caller supplies.
 */
import { actions as wf } from "@powerhousedao/workflow/document-models/workflow";
import type { ChainProvider } from "../../pieces/ethereum/lib/providers.js";

export const ETHEREUM_PIECE_NAME = "@powerhousedao/ethereum-piece";
/** The piece version this package publishes. */
export const ETHEREUM_PIECE_VERSION = "1.0.0";
export const REACTOR_PIECE_NAME = "@powerhousedao/piece-reactor";

export type WorkflowAction = ReturnType<
  | typeof wf.setWorkflowName
  | typeof wf.setWorkflowStatus
  | typeof wf.setTrigger
  | typeof wf.setTriggerConfig
  | typeof wf.addStep
  | typeof wf.addEdge
  | typeof wf.updateStep
  | typeof wf.clearTrigger
  | typeof wf.publishWorkflow
  | typeof wf.setManagedBy
  | typeof wf.setPolicy
>;

export type StepRetry = {
  maxAttempts: number;
  backoff: "FIXED" | "EXPONENTIAL";
  initialDelaySeconds: number;
  maxDelaySeconds: number;
  retryOn: string[];
};

/**
 * What every reconciler workflow retries: transient transport failures -
 * a node still starting, a proxy answering 502. A refusal (4xx) parks the
 * workflow on purpose, so someone looks at it. (Sektar's lesson: without
 * this, every switchboard restart parked every workflow.)
 */
export const STEP_RETRY: StepRetry = {
  maxAttempts: 4,
  backoff: "EXPONENTIAL",
  initialDelaySeconds: 30,
  maxDelaySeconds: 120,
  retryOn: [
    "fetch failed",
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "socket hang up",
    "returned 502",
    "returned 503",
    "returned 504",
  ],
};

export type StepSpec = {
  name: string;
  piece: "ethereum" | "reactor";
  action: string;
  config: Record<string, unknown>;
  /** Wall-clock budget for the action; the engine's default is 30 s. */
  timeoutSeconds?: number;
};

export type TriggerSpec =
  | { kind: "interval"; seconds: number }
  | { kind: "manual" };

export type WorkflowSpec = {
  key: string;
  displayName: string;
  trigger: TriggerSpec;
  steps: StepSpec[];
};

/** The price pinning step both wallet walks run after their import;
 * CoinGecko answers no bitcoin rows, so bitcoin wallets skip it. */
function pinStep(walletDocumentId: string): StepSpec {
  return {
    name: "pin",
    piece: "ethereum",
    action: "pin-prices",
    timeoutSeconds: 120,
    // Batched DefiLlama reads make 500 rows about the cost 50 used to be.
    config: { documentId: walletDocumentId, max: 500 },
  };
}

/** Which documents a portfolio's workflows read and write. */
export type PortfolioResources = {
  portfolioDocumentId: string;
  registryDocumentId: string;
  priceBookDocumentId: string;
  stakingDocumentId: string;
  walletDocumentIds: string[];
};

/**
 * The connections the steps bind to when they are dispatched: the chain
 * connection for the ethereum steps, the reactor one for steps that read
 * and write documents. The spec itself stays pure - the binding is a
 * dispatch-time fact, recorded on the step by the engine.
 */
export type Connections = {
  ethereum: string;
  reactor: string;
};

/**
 * The step's connection fields as the engine stores them. Every step binds
 * the reactor connection: the document-touching actions declare reactor
 * access, and the engine only grants it when the step carries a binding -
 * a step without one fails the run with "bind a reactor connection".
 */
export function connectionOf(step: StepSpec, connections: Connections) {
  const reactor = connections.reactor || null;
  return step.piece === "reactor"
    ? { connectionId: null, reactorConnectionId: reactor }
    : { connectionId: connections.ethereum, reactorConnectionId: reactor };
}

/** The trigger payload doubles as the run's clock: one timestamp per fire. */
const firedAt = "{{trigger.payload.firedAt}}";

/**
 * One wallet's live chain, polled from the Etherscan V2 API: everything
 * since the scan cursor plus the head balance, filed onto the account in
 * one import step. The poller never answers a lower block than the
 * cursor, so quiet minutes no-op instead of tripping the regression
 * guard.
 */
const LIVE_ACTION: Record<ChainProvider, string> = {
  etherscan: "fetch-etherscan-recent",
  blockscout: "fetch-blockscout-recent",
  ankr: "fetch-ankr-recent",
  bitcoin: "fetch-bitcoin-recent",
};
const HISTORY_ACTION: Record<ChainProvider, string> = {
  etherscan: "fetch-etherscan-history",
  blockscout: "fetch-blockscout-history",
  ankr: "fetch-ankr-history",
  bitcoin: "fetch-bitcoin-history",
};

export function liveEtherscanSpec(
  walletDocumentId: string,
  provider: ChainProvider = "etherscan",
  registryDocumentId?: string,
): WorkflowSpec {
  // Only the Etherscan walks read logs; a registry on a step that cannot
  // decode would be a lie, so blockscout/ankr wallets stay generic-only
  // until they speak for themselves.
  const decode =
    provider === "etherscan" && registryDocumentId
      ? { registryDocumentId }
      : {};
  return {
    key: `live-${provider}-${walletDocumentId}`,
    displayName: `Live ${provider[0].toUpperCase()}${provider.slice(1)} ${walletDocumentId.slice(0, 8)}`,
    trigger: { kind: "interval", seconds: 120 },
    steps: [
      {
        name: "poll",
        piece: "ethereum",
        action: LIVE_ACTION[provider],
        timeoutSeconds: 120,
        config: { accountDocumentId: walletDocumentId, ...decode },
      },
      {
        name: "import",
        piece: "ethereum",
        action: "import-events-to-wallet-account",
        config: {
          walletDocumentId,
          batchId: firedAt,
          importedAt: firedAt,
          eventsJson: "{{steps.poll.output.rows}}",
          scanProgressJson: {
            lastNativeScanBlock: "{{steps.poll.output.lastBlock}}",
            ranAt: firedAt,
          },
          nativeStateJson: {
            // EVM answers wei, Bitcoin answers sats; the key is per
            // provider because the wire contract differs, not the model.
            balance: `{{steps.poll.output.${provider === "bitcoin" ? "balanceSats" : "balanceWei"}}}`,
            blockNumber: "{{steps.poll.output.lastBlock}}",
          },
        },
      },
      // Price what just landed; CoinGecko has no bitcoin rows, so the
      // bitcoin wallets skip the step.
      ...(provider === "bitcoin" ? [] : [pinStep(walletDocumentId)]),
    ],
  };
}

/**
 * One wallet's history from the Etherscan V2 API: one confirmed window
 * per run (100k blocks), from the document's backfill cursor - which is
 * 0 for a genesis walk. The import advances the cursor and retires the
 * walk at DONE. Plan-gated categories skip with a note; nothing else
 * stops a window from importing.
 */
export function etherscanBackfillSpec(
  walletDocumentId: string,
  provider: ChainProvider = "etherscan",
  registryDocumentId?: string,
): WorkflowSpec {
  const decode =
    provider === "etherscan" && registryDocumentId
      ? { registryDocumentId }
      : {};
  return {
    key: `${provider}-backfill-${walletDocumentId}`,
    displayName: `${provider[0].toUpperCase()}${provider.slice(1)} backfill ${walletDocumentId.slice(0, 8)}`,
    trigger: { kind: "interval", seconds: 60 },
    steps: [
      {
        name: "walk",
        piece: "ethereum",
        action: HISTORY_ACTION[provider],
        timeoutSeconds: 300,
        config: { accountDocumentId: walletDocumentId, ...decode },
      },
      {
        name: "import",
        piece: "ethereum",
        action: "import-events-to-wallet-account",
        config: {
          walletDocumentId,
          batchId: firedAt,
          importedAt: firedAt,
          eventsJson: "{{steps.walk.output.rows}}",
          backfillDone: "{{steps.walk.output.done}}",
          backfillNextBlock: "{{steps.walk.output.nextBlock}}",
        },
      },
      ...(provider === "bitcoin" ? [] : [pinStep(walletDocumentId)]),
    ],
  };
}

/**
 * The retrofit walk for one wallet: the same window machine as the
 * history walk, reading the document's redecode cursor and importing in
 * replace mode, so generic rows become decoded ones while review fields
 * and pinned valuations ride along untouched. The import retires the
 * cursor to DONE at the head; the reconciler then drops the workflow.
 */
export function redecodeSpec(
  walletDocumentId: string,
  registryDocumentId: string,
): WorkflowSpec {
  return {
    key: `redecode-${walletDocumentId}`,
    displayName: `Re-decode ${walletDocumentId.slice(0, 8)}`,
    trigger: { kind: "interval", seconds: 60 },
    steps: [
      {
        name: "walk",
        piece: "ethereum",
        action: "fetch-etherscan-history",
        timeoutSeconds: 300,
        config: {
          accountDocumentId: walletDocumentId,
          redecode: true,
          registryDocumentId,
          // Smaller walk budget than the plain backfill: every window
          // also fetches registry logs, and the run must finish well
          // inside the step timeout, not be killed by it.
          budgetMs: 180_000,
        },
      },
      {
        name: "import",
        piece: "ethereum",
        action: "import-events-to-wallet-account",
        config: {
          walletDocumentId,
          batchId: firedAt,
          importedAt: firedAt,
          eventsJson: "{{steps.walk.output.rows}}",
          redecode: true,
          redecodeDone: "{{steps.walk.output.done}}",
          redecodeNextBlock: "{{steps.walk.output.nextBlock}}",
        },
      },
      pinStep(walletDocumentId),
    ],
  };
}

/**
 * The hourly DeFi sweep: every wallet the local node can serve (the
 * chain's positions are read by eth_call) asks the registry's position
 * and debt contracts what the wallet holds, and the answer lands on the
 * portfolio. Wallets on other chains are the node's silence, not a gap.
 */
export function positionsSpec(
  portfolioDocumentId: string,
  registryDocumentId: string,
  wallets: Array<{ address: string; chainId: number }>,
): WorkflowSpec {
  return {
    key: "positions-sweep",
    displayName: "DeFi positions sweep",
    trigger: { kind: "interval", seconds: 3600 },
    steps: wallets.map((wallet, i) => ({
      name: `sweep-${i + 1}`,
      piece: "ethereum" as const,
      action: "fetch-positions",
      timeoutSeconds: 240,
      config: {
        documentId: portfolioDocumentId,
        wallet: wallet.address,
        chainId: wallet.chainId,
        protocolRegistryDocumentId: registryDocumentId,
      },
    })),
  };
}
/**
 * The hourly price round: which assets the portfolio holds (holdings knows,
 * price or not), the registry for coingeckoIds, CoinGecko, the book. The
 * holdings step runs unpriced on purpose - it lists the assets.
 */
export function pricesSpec(resources: PortfolioResources): WorkflowSpec {
  return {
    key: "prices-hourly",
    displayName: "Prices hourly",
    trigger: { kind: "interval", seconds: 3600 },
    steps: [
      {
        name: "holdings",
        piece: "ethereum",
        action: "holdings-from-ledger",
        config: {
          portfolioDocumentId: resources.portfolioDocumentId,
          walletDocumentIdsJson: resources.walletDocumentIds,
          priceBookDocumentId: resources.priceBookDocumentId,
          assetRegistryDocumentId: resources.registryDocumentId,
        },
      },
      {
        name: "registry",
        piece: "reactor",
        action: "document-get",
        config: {
          documentId: resources.registryDocumentId,
          documentType: "stackfolio/asset-registry",
        },
      },
      {
        name: "prices",
        piece: "ethereum",
        action: "fetch-prices",
        config: {
          assetIdentifiersJson:
            "{{steps.holdings.output.holdings}}",
          hour: firedAt,
          registryJson: "{{steps.registry.output.state.global}}",
        },
      },
      {
        name: "import",
        piece: "ethereum",
        action: "import-prices-to-book",
        config: {
          priceBookDocumentId: resources.priceBookDocumentId,
          pricesJson: "{{steps.prices.output.prices}}",
          at: firedAt,
          errorMessage: "{{steps.prices.output.error}}",
        },
      },
    ],
  };
}

/**
 * The daily asset round: whatever the ledger holds but the asset registry
 * has never heard of gets named and classified, so a coin that arrives on
 * day one stops being an unnamed line by day two. Holdings runs unpriced
 * on purpose - it lists the assets.
 */
export function assetsSpec(
  resources: PortfolioResources & {
    protocolRegistryDocumentId?: string;
  },
): WorkflowSpec {
  return {
    key: "assets-daily",
    displayName: "Assets daily",
    trigger: { kind: "interval", seconds: 86_400 },
    steps: [
      {
        name: "holdings",
        piece: "ethereum",
        action: "holdings-from-ledger",
        config: {
          portfolioDocumentId: resources.portfolioDocumentId,
          walletDocumentIdsJson: resources.walletDocumentIds,
          priceBookDocumentId: resources.priceBookDocumentId,
          assetRegistryDocumentId: resources.registryDocumentId,
        },
      },
      {
        name: "register",
        piece: "ethereum",
        action: "register-missing-assets",
        config: {
          assetRegistryDocumentId: resources.registryDocumentId,
          holdingsJson: "{{steps.holdings.output}}",
          addedAt: firedAt,
          ...(resources.protocolRegistryDocumentId
            ? { protocolRegistryDocumentId: resources.protocolRegistryDocumentId }
            : {}),
        },
      },
    ],
  };
}

/**
 * The daily staking round: validators by index (the ones watched on the
 * staking document) and by withdrawal address (every tracked mainnet
 * wallet), filed onto the staking document; with auto-snapshot enabled,
 * the priced holdings follow and land as a portfolio snapshot.
 */
export function stakingSpec(
  resources: PortfolioResources & {
    autoSnapshotEnabled: boolean;
    validatorIndices: number[];
    withdrawalAddresses: string[];
  },
): WorkflowSpec {
  const steps: StepSpec[] = [
    {
      name: "validators",
      piece: "ethereum",
      action: "fetch-validators",
      config: {
        indicesJson: resources.validatorIndices,
        withdrawalAddressesJson: resources.withdrawalAddresses,
        hour: firedAt,
      },
    },
    {
      name: "import",
      piece: "ethereum",
      action: "import-staking-to-doc",
      config: {
        stakingDocumentId: resources.stakingDocumentId,
        validatorsJson: "{{steps.validators.output.validators}}",
        balancesJson: "{{steps.validators.output.balances}}",
        ranAt: firedAt,
      },
    },
  ];
  if (resources.autoSnapshotEnabled) {
    steps.push(
      {
        name: "holdings",
        piece: "ethereum",
        action: "holdings-from-ledger",
        config: {
          portfolioDocumentId: resources.portfolioDocumentId,
          walletDocumentIdsJson: resources.walletDocumentIds,
          priceBookDocumentId: resources.priceBookDocumentId,
          assetRegistryDocumentId: resources.registryDocumentId,
        },
      },
      {
        name: "snapshot",
        piece: "ethereum",
        action: "snapshot-portfolio",
        config: {
          portfolioDocumentId: resources.portfolioDocumentId,
          holdingsJson: "{{steps.holdings.output}}",
          snapshotId: firedAt,
          timestamp: firedAt,
        },
      },
    );
  }
  return {
    key: "staking-daily",
    displayName: "Staking daily",
    trigger: { kind: "interval", seconds: 86_400 },
    steps,
  };
}

/**
 * The daily withdrawals round: beacon withdrawals (reward skims, exits)
 * of the staking document's validators, filed onto the same document. Its
 * own workflow, not steps on staking-daily: the reconciler only appends
 * missing steps, and that chain grows conditionally (auto-snapshot).
 */
export function withdrawalsSpec(stakingDocumentId: string): WorkflowSpec {
  return {
    key: "withdrawals-daily",
    displayName: "Withdrawals daily",
    trigger: { kind: "interval", seconds: 86_400 },
    steps: [
      {
        name: "withdrawals",
        piece: "ethereum",
        action: "fetch-withdrawals",
        timeoutSeconds: 120,
        config: { stakingDocumentId },
      },
      {
        name: "import",
        piece: "ethereum",
        action: "import-staking-to-doc",
        config: {
          stakingDocumentId,
          validatorsJson: [],
          balancesJson: [],
          withdrawalsJson: "{{steps.withdrawals.output.withdrawals}}",
          ranAt: firedAt,
        },
      },
    ],
  };
}

/**
 * The Hyperliquid round, a quarter hour apart: refresh every account the
 * Hyperliquid account document tracks (the document holds the address
 * list; the walk adds nothing). Addresses without Hyperliquid activity
 * answer empty and cost one round each - the list is deliberately the
 * user's own, not derived from the wallets.
 */
export function hyperliquidSpec(hyperliquidDocumentId: string): WorkflowSpec {
  return {
    key: "hyperliquid-sync",
    displayName: "Hyperliquid sync",
    trigger: { kind: "interval", seconds: 900 },
    steps: [
      {
        name: "sync",
        piece: "ethereum",
        action: "sync-hyperliquid",
        config: {
          hyperliquidDocumentId,
          ranAt: firedAt,
        },
        timeoutSeconds: 240,
      },
    ],
  };
}

/** Switches a workflow off, leaving who published it as it is. */
export function disableAction() {
  return wf.setWorkflowStatus({ status: "DISABLED" });
}

/**
 * `actions` with a publish in it: the person granting the portfolio becomes
 * the run user of a workflow someone else published. The policy goes in
 * first (it raises the version, and a park only gives way to a newer
 * version), the status stays last.
 */
export function withPublish(
  actions: WorkflowAction[],
  now: string,
): WorkflowAction[] {
  if (actions.some((a) => a.type === "PUBLISH_WORKFLOW")) return actions;
  const publish = [
    wf.setPolicy({ defaultRetry: STEP_RETRY }),
    wf.publishWorkflow({ publishedAt: now }),
  ];
  const status = actions.findIndex(
    (a) => a.type === "SET_WORKFLOW_STATUS",
  );
  if (status < 0) return [...actions, ...publish];
  return [...actions.slice(0, status), ...publish, ...actions.slice(status)];
}

/** Marks a workflow as kept by a portfolio (Studio shows it read-only). */
export function managedByAction(portfolio: {
  id: string;
  name: string;
}) {
  return wf.setManagedBy({
    documentId: portfolio.id,
    documentType: "stackfolio/portfolio",
    label: portfolio.name,
  });
}

/**
 * Everything a new workflow document needs, in the order the runtime wants:
 * name, trigger, steps, the edges that chain them, policy, publish, status.
 * A manual spec carries no trigger: people run it from Studio.
 */
export function buildWorkflow(
  spec: WorkflowSpec,
  newId: () => string,
  now: string,
  connections: Connections,
  reactorPieceVersion = "0.0.0",
): WorkflowAction[] {
  const stepIds = spec.steps.map(() => newId());
  const triggerId =
    spec.trigger.kind === "interval" ? newId() : "unused-manual-trigger-id";
  const stepActions = spec.steps.map((step, i) =>
    wf.addStep({
      id: stepIds[i],
      key: step.name,
      name: step.name,
      ...pieceOf(step, reactorPieceVersion),
      ...connectionOf(step, connections),
      actionName: step.action,
      config: step.config,
    }),
  );
  // The node each step's "next" edge hangs off: the trigger for the first
  // step of an interval workflow, the previous step otherwise.
  const edgeFroms =
    spec.trigger.kind === "interval"
      ? [triggerId, ...stepIds.slice(0, -1)]
      : stepIds.slice(0, -1);
  const edgeTos =
    spec.trigger.kind === "interval" ? stepIds : stepIds.slice(1);
  const edges = edgeTos.map((to, i) =>
    wf.addEdge({ id: newId(), from: edgeFroms[i], to, port: "next" }),
  );
  const actions: WorkflowAction[] = [wf.setWorkflowName({ name: spec.displayName })];
  if (spec.trigger.kind === "interval") {
    actions.push(
      wf.setTrigger({
        id: triggerId,
        pieceName: ETHEREUM_PIECE_NAME,
        pieceVersion: ETHEREUM_PIECE_VERSION,
        triggerName: "on-interval",
        config: { seconds: spec.trigger.seconds, label: spec.key },
      }),
    );
  }
  return [
    ...actions,
    ...stepActions,
    ...edges,
    wf.setPolicy({ defaultRetry: STEP_RETRY }),
    wf.publishWorkflow({ publishedAt: now }),
    wf.setWorkflowStatus({ status: "ENABLED" }),
  ];
}

function pieceOf(step: StepSpec, reactorPieceVersion: string) {
  if (step.piece !== "reactor") {
    return {
      pieceName: ETHEREUM_PIECE_NAME,
      pieceVersion: ETHEREUM_PIECE_VERSION,
    };
  }
  return { pieceName: REACTOR_PIECE_NAME, pieceVersion: reactorPieceVersion };
}
