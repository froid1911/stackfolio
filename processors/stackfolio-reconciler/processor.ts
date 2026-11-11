/**
 * The stackfolio reconciler: on the switchboard that hosts a portfolio,
 * keeps the drive holding what the portfolio asks for - the chain
 * connection and the scan, backfill, price and staking workflows - and
 * records what it built, found and fixed back onto the portfolio. It acts
 * on re-read state only (reconcile.ts), one portfolio at a time: a replay
 * cannot do anything twice. Passes run when a portfolio changes, at
 * startup, and every five minutes (a wallet's progress is read fresh, so
 * no watch on the chain documents is needed).
 */
import type {
  IProcessor,
  IProcessorHostModule,
  OperationWithContext,
} from "@powerhousedao/reactor-browser";
import {
  actions as connectionActions,
  utils as connectionUtils,
} from "@powerhousedao/workflow/document-models/connection";
import { utils as workflowUtils } from "@powerhousedao/workflow/document-models/workflow";
import { generateId } from "document-model";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import type { PortfolioState } from "document-models/portfolio/v1";
import type { WalletAccountState } from "document-models/wallet-account/v1";
import { workflowDrift } from "./drift.js";
import { readFacts } from "./facts.js";
import {
  CONNECTION_TYPE,
  PORTFOLIO_TYPE,
  WALLET_TYPE,
  reconcilePortfolio,
  type Recorded,
  type ReconcileIO,
} from "./reconcile.js";
import type { WorkflowAction } from "./specs.js";

/** Where chain connections, workflows and their documents live. */
const WORKFLOWS_DRIVE = "workflows";
/** The ethereum piece's connector, as the runtime names it. */
const ETHEREUM_CONNECTOR = "@powerhousedao/ethereum-piece#ethereum-piece";
/** The reactor connection, by either name the runtime has used. */
const REACTOR_CONNECTORS: Record<string, true> = {
  "@powerhousedao/piece-reactor#reactor": true,
  "@powerhousedao/reactor#reactor": true,
};
const SWEEP_MS = 300_000;
const STARTUP_MS = 5_000;

type Module = Pick<IProcessorHostModule, "read" | "dispatch" | "host">;

/** The reactor piece's version, read once from the installed runtime. */
function readReactorPieceVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const main = require.resolve("@powerhousedao/workflow");
    const descriptor = new URL(
      "./node/pieces/reactor/descriptor.json",
      new URL(`file://${main}`),
    );
    const parsed: unknown = JSON.parse(readFileSync(descriptor, "utf8"));
    const version =
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      typeof parsed.version === "string"
        ? parsed.version
        : null;
    return version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export class StackfolioReconciler implements IProcessor {
  private queue: Promise<void> = Promise.resolve();
  private readonly waiting = new Set<string>();
  /** Per portfolio, ids this process recorded but the read may lack. */
  private readonly recorded = new Map<string, Recorded>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;
  private reactorVersion: string | undefined;
  /** Last-seen progress marker per workflow key; the stall detector. */
  private readonly fingerprints = new Map<string, string>();

  constructor(
    private readonly driveId: string,
    private readonly module: Module,
  ) {}

  /** Starts the startup pass and the five-minute sweep. */
  start(): void {
    const startup = setTimeout(() => this.sweep(), STARTUP_MS);
    const sweep = setInterval(() => this.sweep(), SWEEP_MS);
    startup.unref();
    sweep.unref();
    this.timers = [startup, sweep];
  }

  onOperations(operations: OperationWithContext[]): Promise<void> {
    if (this.stopped && operations.length > 0) {
      // An operation arrived after a disconnect: the store is live again
      // (a reload reconnects this instance), so re-arm the periodic sweep.
      this.stopped = false;
      this.start();
    }
    for (const { context } of operations) {
      if (context.documentType === PORTFOLIO_TYPE) {
        this.consider(context.documentId);
      }
    }
    return Promise.resolve();
  }

  onDisconnect(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    return Promise.resolve();
  }

  private sweep(): void {
    if (this.stopped) return;
    void this.module.read
      .find({ type: PORTFOLIO_TYPE, parentId: this.driveId })
      .then((page) => {
        for (const doc of page.results) this.consider(doc.header.id);
      })
      .catch((error: unknown) =>
        console.warn(`[stackfolio-reconciler] sweep failed: ${String(error)}`),
      );
  }

  /** Queues one pass for the portfolio, unless one is already waiting. */
  private consider(id: string): void {
    if (this.stopped || this.waiting.has(id)) return;
    this.waiting.add(id);
    this.queue = this.queue.then(async () => {
      this.waiting.delete(id);
      try {
        await this.pass(id);
      } catch (error) {
        console.warn(
          `[stackfolio-reconciler] ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  private async pass(id: string): Promise<void> {
    let doc;
    try {
      doc = await this.module.read.get(id);
    } catch {
      return; // deleted
    }
    // The portfolio must live in this drive: one processor per drive runs
    // it, whichever drive's documents caused the wake-up.
    const mine = await this.module.read
      .find({ type: PORTFOLIO_TYPE, parentId: this.driveId })
      .then((page) => page.results.some((d) => d.header.id === id))
      .catch(() => false);
    if (!mine) return;

    const state = (doc.state as unknown as { global: PortfolioState }).global;
    const recorded = this.recorded.get(id) ?? {
      connectionId: null,
      workflowIds: [],
    };
    this.recorded.set(id, recorded);
    await reconcilePortfolio(
      { id, name: doc.header.name, state },
      recorded,
      this.io(),
    );
  }

  private io(): ReconcileIO {
    const { read, dispatch } = this.module;
    const workflowsDriveId = { current: "" as string };
    const workflowsDrive = async (): Promise<string> => {
      if (!workflowsDriveId.current) {
        const drive = await read.get(WORKFLOWS_DRIVE);
        workflowsDriveId.current = drive.header.id;
      }
      return workflowsDriveId.current;
    };
    return {
      progressFingerprint: (key, fingerprint) => {
        const previous = this.fingerprints.get(key);
        this.fingerprints.set(key, fingerprint);
        return previous === fingerprint;
      },
      now: () => new Date().toISOString(),
      newId: () => generateId(),
      reactorPieceVersion: () => {
        this.reactorVersion ??= readReactorPieceVersion();
        return this.reactorVersion;
      },
      readWorkflow: async (workflowId) => {
        try {
          const doc = await read.get(workflowId);
          return {
            name: doc.header.name,
            facts: readFacts({ state: doc.state }),
          };
        } catch {
          return null;
        }
      },
      createWorkflow: async (key, actions) => {
        const driveId = await workflowsDrive();
        const document = workflowUtils.createDocument();
        document.header.name = key;
        const created = await dispatch.createInDrive(driveId, document);
        const newId = created.documentId || document.header.id;
        await dispatch.execute(newId, "main", actions);
        return newId;
      },
      updateWorkflow: async (workflowId, actions) => {
        await dispatch.execute(workflowId, "main", actions);
      },
      readConnection: async (connectionId) => {
        try {
          const doc = await read.get(connectionId);
          const g = (
            doc.state as unknown as {
              global: { status?: string };
            }
          ).global;
          return { status: g.status ?? null };
        } catch {
          return null;
        }
      },
      createChainConnection: async (name) => {
        const driveId = await workflowsDrive();
        const document = connectionUtils.createDocument();
        document.header.name = name;
        const created = await dispatch.createInDrive(driveId, document);
        const newId = created.documentId || document.header.id;
        await dispatch.execute(newId, "main", [
          connectionActions.setConnectionName({ name }),
          connectionActions.setConnector({
            connectorId: ETHEREUM_CONNECTOR,
            // The piece authenticates with node URLs (all optional: empty
            // means the localhost defaults). NONE would leave the engine
            // without an auth bundle for the steps.
            authType: "CUSTOM_AUTH",
          }),
          connectionActions.setConfig({ config: {} }),
          connectionActions.recordCheckResult({
            status: "OK",
            checkedAt: new Date().toISOString(),
          }),
        ]);
        return newId;
      },
      findChainConnection: async () => {
        const page = await read.find({ type: CONNECTION_TYPE });
        const found = page.results.find((candidate) => {
          const g = (
            candidate.state as unknown as {
              global: { connectorId?: string; status?: string };
            }
          ).global;
          return (
            g.connectorId === ETHEREUM_CONNECTOR && g.status !== "REVOKED"
          );
        });
        return found?.header.id ?? null;
      },
      findReactorConnection: async () => {
        const page = await read.find({ type: CONNECTION_TYPE });
        const found = page.results.find((candidate) => {
          const g = (
            candidate.state as unknown as {
              global: {
                connectorId?: string;
                authType?: string;
                status?: string;
              };
            }
          ).global;
          return (
            Boolean(REACTOR_CONNECTORS[g.connectorId ?? ""]) &&
            g.authType === "REACTOR" &&
            g.status !== "REVOKED"
          );
        });
        return found?.header.id ?? null;
      },
      findWallets: async () => {
        const page = await read.find({
          type: WALLET_TYPE,
          parentId: this.driveId,
        });
        return page.results.map((wallet) => ({
          id: wallet.header.id,
          state: (wallet.state as unknown as { global: WalletAccountState })
            .global,
        }));
      },
      findSingleton: async (type) => {
        const page = await read.find({ type, parentId: this.driveId });
        const first = page.results.at(0);
        if (!first) return null;
        return { id: first.header.id, name: first.header.name };
      },
      dispatchPortfolio: async (portfolioId, actions) => {
        await dispatch.execute(portfolioId, "main", actions);
      },
    };
  }
}

/** Re-exported so the factory's filter and tests read from one place. */
export { workflowDrift, WALLET_TYPE, PORTFOLIO_TYPE };
export type { WorkflowAction };
