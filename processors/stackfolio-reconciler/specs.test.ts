import { describe, expect, it } from "vitest";

import {
  buildWorkflow,
  etherscanBackfillSpec,
  liveEtherscanSpec,
  pricesSpec,
  stakingSpec,
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
    ]);
    expect(spec.steps[0].config).toEqual({ accountDocumentId: "w1" });
    expect(spec.steps[1].config).toMatchObject({
      backfillDone: "{{steps.walk.output.done}}",
      backfillNextBlock: "{{steps.walk.output.nextBlock}}",
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
  });

  it("builds a new workflow in runtime order", () => {
    const actions = buildWorkflow(liveEtherscanSpec("w1"), newIds("i"), "2026-11-11T00:00:00.000Z", connections);
    expect(types(actions)).toEqual([
      "SET_WORKFLOW_NAME",
      "SET_TRIGGER",
      "ADD_STEP",
      "ADD_STEP",
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
    const publish = actions[7] as { input: Record<string, unknown> };
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
});
