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
  redecodeSpec,
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
    ensNames: [],
    ledger: [],
    backfill: { state: "DONE", startBlock: 0, nextBlock: 0 },
    redecode: null,
    cursor: null,
    nativeBalance: null,
    tokenBalances: null,
    bitcoinXpub: null,
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
  singletons: Record<string, { id: string; name: string; state?: unknown } | null> = {};
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
      findSingleton: (type) => {
        const hit = this.singletons[type];
        return Promise.resolve(hit ? { state: undefined, ...hit } : null);
      },
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
        ...wired(spec.steps.length),
        ...over,
      },
    };
  }
}

/** A built workflow's wiring: trigger → s0 → s1 → … */
const wired = (stepCount: number) => ({
  triggerId: "t",
  edges: Array.from({ length: stepCount }, (_, i) => ({
    id: `e${i}`,
    from: i === 0 ? "t" : `s${i - 1}`,
    to: `s${i}`,
  })),
});

const emptyRecorded = (): Recorded => ({ connectionId: null, workflowIds: [] });

/** Facts for a re-decode walk that matches its spec exactly (no drift). */
const retrofitFacts = (walletId: string, registryId: string) => {
  const spec = redecodeSpec(walletId, registryId);
  return {
    name: spec.key,
    facts: {
      status: "ENABLED",
      publishedVersion: 3,
      version: 3,
      name: spec.displayName,
      triggerKind: "interval",
      triggerConfig: { seconds: 60, label: spec.key },
      steps: spec.steps.map((s, i) => ({
        id: `s${i}`,
        name: s.name,
        action: s.action,
        config: s.config,
        timeoutSeconds: s.timeoutSeconds ?? null,
        ...connectionOf(s, CONNECTIONS),
      })),
      managedBy: "p1",
      ...wired(spec.steps.length),
    } satisfies WorkflowFacts,
  };
};

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

  it("adds the Hyperliquid sync workflow when a Hyperliquid document exists", async () => {
    const fake = new FakeIO();
    fake.singletons["stackfolio/hyperliquid-account"] = {
      id: "h1",
      name: "Hyperliquid",
    };
    const doc = portfolioDocWith({ grant: true });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    expect(fake.created.map((c) => c.key)).toContain("hyperliquid-sync");
    const built = fake.created.find((c) => c.key === "hyperliquid-sync");
    const actions = built!.actions as {
      type: string;
      input?: { actionName?: string; config?: Record<string, unknown> };
    }[];
    const step = actions.find((a) => a.type === "ADD_STEP");
    expect(step?.input).toMatchObject({
      actionName: "sync-hyperliquid",
      config: { hyperliquidDocumentId: "h1" },
    });
  });

  it("feeds watched validators and mainnet wallet addresses to the staking spec", async () => {
    const fake = new FakeIO();
    fake.wallets = [
      wallet("w1"),
      wallet("w2", { chainId: 10 }),
      wallet("w3", { ignored: true }),
    ];
    fake.singletons["stackfolio/eth-staking"] = {
      id: "s1",
      name: "ETH Staking",
      state: {
        validators: [
          { index: 7 },
          { index: 11 },
          { index: "bad" },
        ],
      },
    };
    const doc = portfolioDocWith({ grant: true });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    const built = fake.created.find((c) => c.key === "staking-daily");
    expect(built).toBeDefined();
    const actions = built!.actions as {
      type: string;
      input?: { actionName?: string; config?: Record<string, unknown> };
    }[];
    const validators = actions.find(
      (a) => a.input?.actionName === "fetch-validators",
    );
    // Watched indices go verbatim; non-integers are dropped. Addresses are
    // the non-ignored mainnet wallets only; w2 (chain 10) and w3 (ignored)
    // can't host Ethereum validators withdrawing here.
    expect(validators?.input?.config).toMatchObject({
      indicesJson: [7, 11],
      withdrawalAddressesJson: [
        `0x${"w1".repeat(40).slice(0, 40)}`,
      ],
    });
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
          { code: "MISSING_PROTOCOL_REGISTRY" },
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

  it("routes a Blockscout chain to Blockscout actions", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1", { chainId: 10 })];
    fake.connectionStatus["eth-1"] = "OK";
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    const live = fake.created.find((c) => c.key === "live-blockscout-w1");
    expect(live).toBeDefined();
    const wiring = JSON.stringify(live?.actions);
    expect(wiring).toContain("fetch-blockscout-recent");
    expect(wiring).not.toContain("fetch-etherscan-recent");
  });

  it("warns, and builds nothing, for a chain no free plan covers", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1", { chainId: 1284, label: "Moonbeam user" })];
    fake.connectionStatus["eth-1"] = "OK";
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    const check = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "RECORD_CHECK") as {
      input: { issues: Array<{ code: string; message: string }> };
    };
    const unsupported = check.input.issues.find(
      (i) => i.code === "UNSUPPORTED_CHAIN",
    );
    expect(unsupported?.message).toContain("1284");
    expect(fake.created.filter((c) => c.key.includes("w1"))).toEqual([]);
  });

  it("routes Ankr-roster chains to Ankr actions", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1", { chainId: 8453, backfill: null })];
    fake.connectionStatus["eth-1"] = "OK";
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    const keys = fake.created.map((c) => c.key);
    expect(keys).toContain("live-ankr-w1");
    expect(keys).toContain("ankr-backfill-w1");
    const wiring = JSON.stringify(fake.created);
    expect(wiring).toContain("fetch-ankr-recent");
    expect(wiring).toContain("fetch-ankr-history");
  });

  it("routes chain-0 wallets with an xpub to Bitcoin actions", async () => {
    const fake = new FakeIO();
    fake.wallets = [
      wallet("w1", {
        chainId: 0,
        address: "",
        bitcoinXpub:
          "xpub6Bm9M1SxZdzL3TxdNV8897FgtTLBgehR1wVNnMyJ5VLRK5n3tFqXxrCVnVQj4zooN4eFSkf6Sma84reWc5ZCXMxPbLXQs3BcaBdTd4YQa3B",
        backfill: null,
      }),
    ];
    fake.connectionStatus["eth-1"] = "OK";
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    const keys = fake.created.map((c) => c.key);
    expect(keys).toContain("live-bitcoin-w1");
    expect(keys).toContain("bitcoin-backfill-w1");
    const wiring = JSON.stringify(fake.created);
    expect(wiring).toContain("fetch-bitcoin-recent");
    expect(wiring).toContain("fetch-bitcoin-history");
    // The live import writes sats, not wei, onto the native balance.
    expect(wiring).toContain("balanceSats");
  });

  it("warns, and builds nothing, for a chain-0 wallet that was never configured", async () => {
    const fake = new FakeIO();
    fake.wallets = [wallet("w1", { chainId: 0, address: "", backfill: null })];
    fake.connectionStatus["eth-1"] = "OK";
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    const check = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "RECORD_CHECK") as {
      input: { issues: Array<{ code: string; message: string }> };
    };
    expect(check.input.issues.find((i) => i.code === "INCOMPLETE_WALLET")).toBeTruthy();
    expect(fake.created.filter((c) => c.key.includes("w1"))).toEqual([]);
  });

  it("arms the retrofit and builds the re-decode walk for a decoded wallet", async () => {
    const fake = new FakeIO();
    // A hex id: the address must pass the position sweep's address check.
    fake.wallets = [wallet("abcd")];
    fake.connectionStatus["eth-1"] = "OK";
    fake.singletons["stackfolio/protocol-registry"] = {
      id: "pr-1",
      name: "Protocol registry",
    };
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    // The cursor is armed exactly once...
    const armed = fake.dispatched
      .flatMap((d) => d.actions)
      .filter((a) => (a as { type: string }).type === "SET_REDECODE_STATE");
    expect(armed).toHaveLength(1);
    // ...and the retrofit workflow is built with the registry on the walk.
    const retrofit = fake.created.find((c) => c.key === "redecode-abcd");
    expect(retrofit).toBeTruthy();
    const wiring = JSON.stringify(retrofit?.actions);
    expect(wiring).toContain("\"redecode\":true");
    expect(wiring).toContain("pr-1");
    // The live poll decodes too, once the registry exists.
    const live = fake.created.find((c) => c.key === "live-etherscan-abcd");
    expect(JSON.stringify(live?.actions)).toContain("registryDocumentId");
    // The chain-1 wallet is reachable by the position sweep.
    const sweep = fake.created.find((c) => c.key === "positions-sweep");
    expect(JSON.stringify(sweep?.actions)).toContain("fetch-positions");
  });

  it("does not arm twice, and retires the retrofit at DONE", async () => {
    const fake = new FakeIO();
    fake.wallets = [
      wallet("w1", {
        redecode: { state: "DONE", startBlock: 0, nextBlock: 26_394_964 },
      }),
    ];
    fake.connectionStatus["eth-1"] = "OK";
    fake.singletons["stackfolio/protocol-registry"] = {
      id: "pr-1",
      name: "Protocol registry",
    };
    fake.workflows.set(
      "wf-redecode",
      retrofitFacts("w1", "pr-1"),
    );
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: ["wf-redecode"] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    expect(
      fake.dispatched
        .flatMap((d) => d.actions)
        .filter((a) => (a as { type: string }).type === "SET_REDECODE_STATE"),
    ).toEqual([]);
    // No new retrofit workflow...
    expect(fake.created.filter((c) => c.key.startsWith("redecode-"))).toEqual([]);
    // ...and the old one is switched off.
    const disabled = fake.updated.find((u) =>
      u.actions.some((a) => (a as { type: string }).type === "SET_WORKFLOW_STATUS"),
    );
    expect(disabled?.id).toBe("wf-redecode");
  });

  it("switches off a duplicate claim on the same spec key", async () => {
    const fake = new FakeIO();
    fake.connectionStatus["eth-1"] = "OK";
    const facts = fake.inSyncFacts("w1");
    fake.workflows.set("wf-first", facts);
    fake.workflows.set("wf-second", facts);
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: ["wf-first", "wf-second"] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());

    // The duplicate is switched off...
    const disabled = fake.updated.find((u) =>
      u.actions.some((a) => (a as { type: string }).type === "SET_WORKFLOW_STATUS"),
    );
    expect(disabled?.id).toBe("wf-second");
    // ...and leaves the record: only the keeper is dispatched back.
    const resources = fake.dispatched
      .flatMap((d) => d.actions)
      .find((a) => (a as { type: string }).type === "RECORD_RESOURCES") as {
      input: { workflowIds: string[] };
    } | undefined;
    expect(resources?.input.workflowIds).toEqual(["wf-first"]);
  });

  it("never re-decodes a wallet whose history is still walking", async () => {
    const fake = new FakeIO();
    fake.wallets = [
      wallet("w1", {
        backfill: { state: "NATIVE", startBlock: 0, nextBlock: 5_000 },
      }),
    ];
    fake.connectionStatus["eth-1"] = "OK";
    fake.singletons["stackfolio/protocol-registry"] = {
      id: "pr-1",
      name: "Protocol registry",
    };
    const doc = portfolioDocWith({
      grant: true,
      resources: { connectionId: "eth-1", workflowIds: [] },
      lastCheck: { issues: [], fixes: [] },
    });
    await reconcilePortfolio(doc, emptyRecorded(), fake.io());
    expect(fake.created.filter((c) => c.key.startsWith("redecode-"))).toEqual([]);
    expect(
      fake.dispatched
        .flatMap((d) => d.actions)
        .filter((a) => (a as { type: string }).type === "SET_REDECODE_STATE"),
    ).toEqual([]);
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
