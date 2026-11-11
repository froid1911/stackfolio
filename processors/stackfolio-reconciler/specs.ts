/**
 * The workflows the reconciler owns, as data: a trigger, a chain of steps
 * and the actions that (re)build them. Pure module - no I/O, no clock, no
 * ids invented except through the `newId` the caller supplies.
 */
import { actions as wf } from "@powerhousedao/workflow/document-models/workflow";

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
 * One wallet's live chain: token transfers, the newest native blocks, the
 * head balance, then everything filed onto the account. Two import steps
 * because the engine passes one whole value per reference; the ledger
 * dedupes either way.
 */
export function liveScanSpec(walletDocumentId: string): WorkflowSpec {
  return {
    key: `live-scan-${walletDocumentId}`,
    displayName: `Live scan ${walletDocumentId.slice(0, 8)}`,
    trigger: { kind: "interval", seconds: 300 },
    steps: [
      {
        name: "scan-logs",
        piece: "ethereum",
        action: "scan-account-logs",
        config: { accountDocumentId: walletDocumentId },
      },
      {
        name: "scan-native",
        piece: "ethereum",
        action: "scan-native-transactions",
        config: {
          accountDocumentId: walletDocumentId,
          maxBlocks: 2000,
          direction: "HEAD",
        },
      },
      {
        name: "fetch-state",
        piece: "ethereum",
        action: "fetch-account-state",
        config: { accountDocumentId: walletDocumentId },
      },
      {
        name: "import-logs",
        piece: "ethereum",
        action: "import-events-to-wallet-account",
        config: {
          walletDocumentId,
          batchId: firedAt,
          importedAt: firedAt,
          eventsJson: "{{steps.scan-logs.output.rows}}",
          scanProgressJson: {
            lastLogsBlock: "{{steps.scan-logs.output.lastBlock}}",
            ranAt: firedAt,
          },
        },
      },
      {
        name: "import-native",
        piece: "ethereum",
        action: "import-events-to-wallet-account",
        config: {
          walletDocumentId,
          batchId: firedAt,
          importedAt: firedAt,
          eventsJson: "{{steps.scan-native.output.rows}}",
          scanProgressJson: {
            lastNativeScanBlock: "{{steps.scan-native.output.nextBlock}}",
            ranAt: firedAt,
          },
          nativeStateJson: "{{steps.fetch-state.output}}",
        },
      },
    ],
  };
}

/**
 * One wallet's history walk: a bounded chunk of native blocks per run, from
 * the document's backfill cursor. The reconciler retires it at DONE.
 */
export function nativeBackfillSpec(walletDocumentId: string): WorkflowSpec {
  return {
    key: `native-backfill-${walletDocumentId}`,
    displayName: `Native backfill ${walletDocumentId.slice(0, 8)}`,
    trigger: { kind: "interval", seconds: 300 },
    steps: [
      {
        name: "walk",
        piece: "ethereum",
        action: "scan-native-transactions",
        config: { accountDocumentId: walletDocumentId, maxBlocks: 500_000 },
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
          scanProgressJson: {
            lastNativeScanBlock: "{{steps.walk.output.nextBlock}}",
            ranAt: firedAt,
          },
        },
      },
    ],
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
 * The daily staking round: validators by index and by withdrawal address,
 * filed onto the staking document; with auto-snapshot enabled, the priced
 * holdings follow and land as a portfolio snapshot.
 */
export function stakingSpec(
  resources: PortfolioResources & { autoSnapshotEnabled: boolean },
): WorkflowSpec {
  const steps: StepSpec[] = [
    {
      name: "validators",
      piece: "ethereum",
      action: "fetch-validators",
      config: {
        indicesJson: [],
        withdrawalAddressesJson: [],
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
