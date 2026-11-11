import { describe, expect, it } from "vitest";

import { actions, reducer, utils } from "document-models/portfolio/v1";
import type { PortfolioState } from "document-models/portfolio/v1";
import type { WalletAccountState } from "document-models/wallet-account/v1";

import type { WorkflowFacts } from "./facts.js";
import {
  reconcilePortfolio,
  type Recorded,
  type ReconcileIO,
} from "./reconcile.js";
import {
  connectionOf,
  liveEtherscanSpec,
  type Connections,
} from "./specs.js";

const CONNECTIONS: Connections = { ethereum: "eth-1", reactor: "reac-1" };

const wallet = (
  id: string,
  over: Partial<WalletAccountState> = {},
): { id: string; state: WalletAccountState } => ({
  id,
  state: {
    address: `0x${id.repeat(40).slice(0, 40)}`,
    chainId: 1,
    ignored: false,
    ledger: [],
    backfill: { state: "DONE", startBlock: 0, nextBlock: 0 },
    cursor: null,
    nativeBalance: null,
    label: null,
    ...over,
  },
});

/** A fake reactor: the test hands it what reads will answer, it records writes. */
class FakeIO {
  created: Array<{ key: string; actions: unknown[] }> = [];
  updated: Array<{ id: string; actions: unknown[] }> = [];
  dispatched: Array<{ id: string; actions: unknown[] }> = [];
  workflows = new Map<string, { name: string; facts: WorkflowFacts }>();
  wallets: Array<{ id: string; state: WalletAccountState }> = [];
  singletons: Record<string, { id: string; name: string } | null> = {};
  connectionStatus: Record<string, string | null> = {};
  reactorConnectionId: string | null = "reac-1";
  nextId = 1;
  fingerprints = new Map<string, string>();

  io(): ReconcileIO {
    return {
      progressFingerprint: (key, fingerprint) => {
        const previous = this.fingerprints.get(key);
        this.fingerprints.set(key, fingerprint);
        return previous === fingerprint;
      },
      now: () => "2026-11-11T12:00:00.000Z",
      newId: () => `n${this.nextId++}`,
      reactorPieceVersion: () => "6.2.3",
      readWorkflow: (id) => Promise.resolve(this.workflows.get(id) ?? null),
      createWorkflow: (key, actions) => {
        this.created.push({ key, actions });
        return Promise.resolve(`wf-${key}`);
      },
      updateWorkflow: (id, actions) => {
        this.updated.push({ id, actions });
        return Promise.resolve();
      },
      readConnection: (id) =>
        Promise.resolve(
          id in this.connectionStatus
            ? { status: this.connectionStatus[id] }
            : null,
        ),
      createChainConnection: () => Promise.resolve("eth-1"),
      findChainConnection: () => Promise.resolve(null),
      findReactorConnection: () => Promise.resolve(this.reactorConnectionId),
      findWallets: () => Promise.resolve(this.wallets),
      findSingleton: (type) => Promise.resolve(this.singletons[type] ?? null),
      dispatchPortfolio: (id, actions) => {
        this.dispatched.push({ id, actions });
        return Promise.resolve();
      },
      dispatchWallet: (id, actions) => {
        this.dispatched.push({ id, actions });
        return Promise.resolve();
      },
    };
  }

  /** Facts for a live scan that matches the spec exactly (no drift). */
  inSyncFacts(
    walletId: string,
    over: Partial<WorkflowFacts> = {},
  ): { name: string; facts: WorkflowFacts } {
    const spec = liveEtherscanSpec(walletId);
    return {
      name: spec.key,
      facts: {
        status: "ENABLED",
        publishedVersion: 3,
        version: 3,
        name: spec.displayName,
        triggerKind: "interval",
        triggerConfig: { seconds: 120, label: spec.key },
        steps: spec.steps.map((s, i) => ({
          id: `s${i}`,
          name: s.name,
          action: s.action,
          config: s.config,
          timeoutSeconds: s.timeoutSeconds ?? null,
          ...connectionOf(s, CONNECTIONS),
        })),
        managedBy: "p1",
        ...over,
      },
    };
  }
}

const emptyRecorded = (): Recorded => ({ connectionId: null, workflowIds: [] });

describe("reconcilePortfolio", () => {
  it("drafts workflows and blocks when nobody is granted", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1")];
    fake.connectionStatus["eth-1"] = "OK";
    const doc = portfolioDocWith({});
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    expect(fake.created).toHaveLength(1);
    expect(fake.created[0].key).toBe("live-etherscan-w1");
    const types = fake.created[0].actions.map(
      (a) => (a as { type: string }).type,
    );
    expect(types).not.toContain("PUBLISH_WORKFLOW");
    expect(types).not.toContain("SET_POLICY");

    const check = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "RECORD_CHECK") as {
      input: { issues: Array<{ code: string; severity: string }> };
    };
    expect(check.input.issues.map((i) => i.code)).toContain("NO_GRANT");
    expect(check.input.issues.find((i) => i.code === "NO_GRANT")?.severity).toBe(
      "BLOCKING",
    );
  });

  it("publishes and records resources when granted", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1")];
    const doc = portfolioDocWith({ grant: true });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    const types = fake.created[0].actions.map(
      (a) => (a as { type: string }).type,
    );
    expect(types).toContain("PUBLISH_WORKFLOW");

    const resources = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "RECORD_RESOURCES") as {
      input: { connectionId: string; workflowIds: string[] };
    };
    expect(resources.input.connectionId).toBe("eth-1");
    expect(resources.input.workflowIds).toEqual(["wf-live-etherscan-w1"]);

    const check = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "RECORD_CHECK") as {
      input: { fixes: Array<{ code: string }> };
    };
    expect(check.input.fixes.map((f) => f.code)).toEqual([
      "CONNECTION_CREATED",
      "WORKFLOW_BUILT",
    ]);
  });

  it("does nothing when the drive already matches the portfolio", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1")];
    fake.connectionStatus["eth-1"] = "OK";
    fake.workflows.set("wf-old", fake.inSyncFacts("w1"));
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: ["wf-old"] },
      lastCheck: {
        issues: [
          { code: "MISSING_REGISTRY" },
          { code: "MISSING_PRICE_BOOK" },
        ],
        fixes: [],
      },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    expect(fake.created).toEqual([]);
    expect(fake.updated).toEqual([]);
    expect(fake.dispatched).toEqual([]);
  });

  it("re-arms a workflow whose progress stopped moving", async () => {
    const fake = new FakeIO();
    fake.wallets = [
      wallet("w1", {
        cursor: {
          lastLogsBlock: 100,
          lastNativeScanBlock: 100,
          lastEventTimestamp: null,
          lastRunAt: "2026-11-11T11:55:00.000Z",
        },
      }),
    ];
    fake.connectionStatus["eth-1"] = "OK";
    fake.workflows.set("wf-old", fake.inSyncFacts("w1"));
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: ["wf-old"] },
      lastCheck: { issues: [], fixes: [] },
    });

    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    expect(fake.updated).toEqual([]);

    // A second pass sees the same cursor: the scan has not reported in,
    // so the trigger config is re-sent - the version bump lifts a park.
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    expect(fake.updated).toHaveLength(1);
    expect(fake.updated[0].id).toBe("wf-old");
    expect(
      fake.updated[0].actions.map((a) => (a as { type: string }).type),
    ).toEqual(["SET_TRIGGER_CONFIG"]);
  });

  it("leaves a workflow whose cursor keeps moving", async () => {
    const fake = new FakeIO();
    fake.wallets = [
      wallet("w1", {
        cursor: {
          lastLogsBlock: 100,
          lastNativeScanBlock: 100,
          lastEventTimestamp: null,
          lastRunAt: "2026-11-11T11:55:00.000Z",
        },
      }),
    ];
    fake.connectionStatus["eth-1"] = "OK";
    fake.workflows.set("wf-old", fake.inSyncFacts("w1"));
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: ["wf-old"] },
      lastCheck: { issues: [], fixes: [] },
    });

    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    fake.wallets[0].state.cursor = {
      lastLogsBlock: 200,
      lastNativeScanBlock: 200,
      lastEventTimestamp: null,
      lastRunAt: "2026-11-11T11:58:00.000Z",
    };
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    expect(fake.updated).toEqual([]);
  });

  it("switches off the workflow of a wallet that left", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1", { ignored: true })];
    fake.connectionStatus["eth-1"] = "OK";
    fake.workflows.set("wf-old", fake.inSyncFacts("w1"));
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: ["wf-old"] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    expect(fake.updated).toHaveLength(1);
    expect(fake.updated[0].id).toBe("wf-old");
    expect(
      fake.updated[0].actions.map((a) => (a as { type: string }).type),
    ).toEqual(["SET_WORKFLOW_STATUS"]);
  });

  it("rebuilds a workflow someone deleted and heals the record", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1")];
    fake.connectionStatus["eth-1"] = "OK";
    // wf-gone is recorded but unreadable; the spec must come back fresh.
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: ["wf-gone"] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    expect(fake.created).toHaveLength(1);
    const resources = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "RECORD_RESOURCES") as {
      input: { workflowIds: string[] };
    };
    expect(resources.input.workflowIds).toEqual(["wf-live-etherscan-w1"]);
  });

  it("waits, not crashes, without a Powerhouse connection", async () => {
    const fake = new FakeIO();
    fake.reactorConnectionId = null;
    fake.wallets = [wallet("w1")];
    fake.singletons["stackfolio/asset-registry"] = { id: "r1", name: "Registry" };
    fake.singletons["stackfolio/price-book"] = { id: "b1", name: "Book" };
    const doc = portfolioDocWith({ grant: true });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    // Every spec has document-touching steps, so all of them wait; the
    // engine refuses those steps' reactor access without a binding.
    expect(fake.created.map((c) => c.key)).toEqual([]);
    const check = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "RECORD_CHECK") as {
      input: { issues: Array<{ code: string }> };
    };
    const codes = check.input.issues.map((i) => i.code);
    expect(codes).toContain("REACTOR_CONNECTION");
    expect(codes).toContain("WORKFLOW_WAITING");
  });

  it("reimports from genesis a wallet whose node-walk finished short", async () => {
    const fake = new FakeIO();
    fake.wallets = [
      wallet("w1", {
        backfill: { state: "DONE", startBlock: 26383540, nextBlock: 26394149 },
      }),
    ];
    fake.connectionStatus["eth-1"] = "OK";
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    const reset = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "SET_BACKFILL_STATE") as {
      input: Record<string, unknown>;
    };
    expect(reset.input).toEqual({
      state: "NATIVE",
      startBlock: 0,
      nextBlock: 0,
    });
    // and the history workflow is wanted again, in the same pass
    expect(fake.created.map((c) => c.key)).toContain("etherscan-backfill-w1");
  });

  it("leaves a wallet that already walks from genesis alone", async () => {
    const fake = new FakeIO();
    fake.wallets = [
      wallet("w1", {
        backfill: { state: "NATIVE", startBlock: 0, nextBlock: 5000 },
      }),
    ];
    fake.connectionStatus["eth-1"] = "OK";
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    const resets = fake.dispatched
      .flatMap((d) => d.actions)
      .filter((a) => (a as { type: string }).type === "SET_BACKFILL_STATE");
    expect(resets).toEqual([]);
    expect(fake.created.map((c) => c.key)).toContain("etherscan-backfill-w1");
  });
});

/** Same doc builder, by keyword: the reducers above need real inputs. */
function portfolioDocWith(over: {
  grant?: boolean;
  resources?: { connectionId: string; workflowIds: string[] };
  lastCheck?: { issues: Array<{ code: string; severity?: string }>; fixes: [] };
}) {
  let document = reducer(
    utils.createDocument(),
    actions.setPortfolioDetails({ name: "Frank" }),
  );
  if (over.grant) {
    document = reducer(
      document,
      actions.setGrant({
        id: "did:pkh:eip155:1:0xfrank",
        grantedAt: "2026-11-11T00:00:00.000Z",
      }),
    );
  }
  if (over.resources) {
    document = reducer(document, actions.recordResources(over.resources));
  }
  if (over.lastCheck) {
    document = reducer(
      document,
      actions.recordCheck({
        at: "2026-11-11T11:00:00.000Z",
        issues: over.lastCheck.issues.map((i) => ({
          code: i.code,
          message: i.code,
          severity: (i.severity ?? "WARNING") as "WARNING",
        })),
        fixes: [],
      }),
    );
  }
  return {
    id: "p1",
    name: "Frank",
    state: (document.state as unknown as { global: PortfolioState }).global,
  };
}
