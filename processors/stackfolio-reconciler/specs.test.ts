import { describe, expect, it } from "vitest";

import {
  buildWorkflow,
  etherscanBackfillSpec,
  liveEtherscanSpec,
  positionsSpec,
  pricesSpec,
  hyperliquidSpec,
  redecodeSpec,
  stakingSpec,
  connectionOf,
  withPublish,
  type Connections,
  type WorkflowSpec,
} from "./specs.js";

const connections: Connections = { ethereum: "eth-1", reactor: "reactor-1" };

const resources = {
  portfolioDocumentId: "p1",
  registryDocumentId: "r1",
  priceBookDocumentId: "b1",
  stakingDocumentId: "s1",
  walletDocumentIds: ["w1", "w2"],
  validatorIndices: [7],
  withdrawalAddresses: ["0xabcd"],
};

const newIds = (prefix: string) => {
  let n = 0;
  return () => `${prefix}${++n}`;
};

const types = (actions: { type: string }[]) => actions.map((a) => a.type);

describe("specs", () => {
  it("live Etherscan polls since the cursor and imports rows, progress and balance", () => {
    const spec = liveEtherscanSpec("w1");
    expect(spec.trigger).toEqual({ kind: "interval", seconds: 120 });
    expect(spec.steps.map((s) => s.action)).toEqual([
      "fetch-etherscan-recent",
      "import-events-to-wallet-account",
      "pin-prices",
    ]);
    const importStep = spec.steps[1].config;
    expect(importStep).toMatchObject({
      scanProgressJson: {
        lastNativeScanBlock: "{{steps.poll.output.lastBlock}}",
        ranAt: "{{trigger.payload.firedAt}}",
      },
      nativeStateJson: {
        balance: "{{steps.poll.output.balanceWei}}",
        blockNumber: "{{steps.poll.output.lastBlock}}",
      },
    });
  });

  it("Etherscan backfill walks windows from the document cursor", () => {
    const spec = etherscanBackfillSpec("w1");
    expect(spec.steps.map((s) => s.action)).toEqual([
      "fetch-etherscan-history",
      "import-events-to-wallet-account",
      "pin-prices",
    ]);
    expect(spec.steps[0].config).toEqual({ accountDocumentId: "w1" });
    expect(spec.steps[1].config).toMatchObject({
      backfillDone: "{{steps.walk.output.done}}",
      backfillNextBlock: "{{steps.walk.output.nextBlock}}",
    });
  });

  it("wires the registry into the Etherscan walks, not the others", () => {
    const live = liveEtherscanSpec("w1", "etherscan", "reg-1");
    expect(live.steps[0].config).toMatchObject({ registryDocumentId: "reg-1" });
    const backfill = etherscanBackfillSpec("w1", "etherscan", "reg-1");
    expect(backfill.steps[0].config).toMatchObject({
      registryDocumentId: "reg-1",
    });
    const blockscout = etherscanBackfillSpec("w1", "blockscout", "reg-1");
    expect(blockscout.steps[0].config).not.toHaveProperty("registryDocumentId");
  });

  it("re-decode re-walks from the redecode cursor and imports in replace mode", () => {
    const spec = redecodeSpec("w1", "reg-1");
    expect(spec.key).toBe("redecode-w1");
    expect(spec.trigger).toEqual({ kind: "interval", seconds: 60 });
    expect(spec.steps.map((s) => s.action)).toEqual([
      "fetch-etherscan-history",
      "import-events-to-wallet-account",
      "pin-prices",
    ]);
    expect(spec.steps[0].config).toEqual({
      accountDocumentId: "w1",
      redecode: true,
      registryDocumentId: "reg-1",
      budgetMs: 180_000,
    });
    expect(spec.steps[1].config).toMatchObject({
      redecode: true,
      redecodeDone: "{{steps.walk.output.done}}",
      redecodeNextBlock: "{{steps.walk.output.nextBlock}}",
    });
    expect(spec.steps[1].config).not.toHaveProperty("backfillNextBlock");
  });

  it("the position sweep walks every reachable wallet once", () => {
    const spec = positionsSpec("p1", "reg-1", [
      { address: "0xaa", chainId: 1 },
      { address: "0xbb", chainId: 1 },
    ]);
    expect(spec.trigger).toEqual({ kind: "interval", seconds: 3600 });
    expect(spec.steps.map((s) => s.action)).toEqual([
      "fetch-positions",
      "fetch-positions",
    ]);
    expect(spec.steps[0].config).toEqual({
      documentId: "p1",
      wallet: "0xaa",
      chainId: 1,
      protocolRegistryDocumentId: "reg-1",
    });
  });

  it("prices list held assets via holdings and the reactor registry", () => {
    const spec = pricesSpec(resources);
    expect(spec.steps.map((s) => [s.name, s.action])).toEqual([
      ["holdings", "holdings-from-ledger"],
      ["registry", "document-get"],
      ["prices", "fetch-prices"],
      ["import", "import-prices-to-book"],
    ]);
    expect(spec.trigger).toEqual({ kind: "interval", seconds: 3600 });
  });

  it("staking appends the snapshot pair only when enabled", () => {
    const on = stakingSpec({ ...resources, autoSnapshotEnabled: true });
    const off = stakingSpec({ ...resources, autoSnapshotEnabled: false });
    expect(on.steps.map((s) => s.name)).toEqual([
      "validators",
      "import",
      "holdings",
      "snapshot",
    ]);
    expect(off.steps.map((s) => s.name)).toEqual(["validators", "import"]);
    expect(on.trigger).toEqual({ kind: "interval", seconds: 86_400 });
    const validators = on.steps[0];
    expect(validators.config).toMatchObject({
      indicesJson: [7],
      withdrawalAddressesJson: ["0xabcd"],
    });
  });

  it("builds a new workflow in runtime order", () => {
    const actions = buildWorkflow(liveEtherscanSpec("w1"), newIds("i"), "2026-11-11T00:00:00.000Z", connections);
    expect(types(actions)).toEqual([
      "SET_WORKFLOW_NAME",
      "SET_TRIGGER",
      "ADD_STEP",
      "ADD_STEP",
      "ADD_STEP",
      "ADD_EDGE",
      "ADD_EDGE",
      "ADD_EDGE",
      "SET_POLICY",
      "PUBLISH_WORKFLOW",
      "SET_WORKFLOW_STATUS",
    ]);
    const firstStep = actions[2] as { input: Record<string, unknown> };
    expect(firstStep.input).toMatchObject({
      connectionId: "eth-1",
      reactorConnectionId: "reactor-1",
    });
    const trigger = actions[1] as { input: Record<string, unknown> };
    expect(trigger.input).toMatchObject({
      pieceName: "@powerhousedao/ethereum-piece",
      triggerName: "on-interval",
      config: { seconds: 120, label: "live-etherscan-w1" },
    });
    const publish = actions.find((a) => a.type === "PUBLISH_WORKFLOW") as {
      input: Record<string, unknown>;
    };
    expect(publish.input).toEqual({ publishedAt: "2026-11-11T00:00:00.000Z" });
  });

  it("chains manual workflows without a trigger", () => {
    const spec: WorkflowSpec = {
      key: "manual-one",
      displayName: "Manual one",
      trigger: { kind: "manual" },
      steps: [
        { name: "a", piece: "ethereum", action: "fetch-account-state", config: {} },
        { name: "b", piece: "ethereum", action: "fetch-account-state", config: {} },
      ],
    };
    const actions = buildWorkflow(spec, newIds("m"), "2026-11-11T00:00:00.000Z", connections);
    expect(types(actions)).toEqual([
      "SET_WORKFLOW_NAME",
      "ADD_STEP",
      "ADD_STEP",
      "ADD_EDGE",
      "SET_POLICY",
      "PUBLISH_WORKFLOW",
      "SET_WORKFLOW_STATUS",
    ]);
    const edge = actions[3] as { input: Record<string, unknown> };
    // b hangs off a, not off a phantom trigger id.
    expect(edge.input).toMatchObject({ from: "m1", to: "m2" });
  });

  it("withPublish adds policy and a stamped publish, keeping status last", () => {
    const actions = buildWorkflow(
      etherscanBackfillSpec("w1"),
      newIds("x"),
      "2026-11-11T00:00:00.000Z",
      connections,
    );
    // buildWorkflow already publishes: idempotent.
    expect(withPublish(actions, "2026-11-12T00:00:00.000Z")).toBe(actions);

    const unpublished = actions.filter((a) => a.type !== "PUBLISH_WORKFLOW");
    const repaired = withPublish(unpublished, "2026-11-12T00:00:00.000Z");
    const publishAt = types(repaired).indexOf("PUBLISH_WORKFLOW");
    const statusAt = types(repaired).indexOf("SET_WORKFLOW_STATUS");
    expect(publishAt).toBeGreaterThan(-1);
    expect(statusAt).toBe(publishAt + 1); // policy, publish, then status
    const publish = repaired[publishAt] as { input: Record<string, unknown> };
    expect(publish.input).toEqual({ publishedAt: "2026-11-12T00:00:00.000Z" });
  });
  it("syncs every Hyperliquid account the document tracks", () => {
    const spec = hyperliquidSpec("h1");
    expect(spec.key).toBe("hyperliquid-sync");
    expect(spec.trigger).toEqual({ kind: "interval", seconds: 900 });
    expect(spec.steps).toHaveLength(1);
    expect(spec.steps[0]).toMatchObject({
      piece: "ethereum",
      action: "sync-hyperliquid",
      config: {
        hyperliquidDocumentId: "h1",
        ranAt: "{{trigger.payload.firedAt}}",
      },
    });
    // The step writes documents: it needs the reactor connection.
    expect(connectionOf(spec.steps[0], connections)).toEqual({
      connectionId: "eth-1",
      reactorConnectionId: "reactor-1",
    });
  });
});
