import { describe, expect, it } from "vitest";

import { readFacts, type WorkflowFacts } from "./facts.js";
import { workflowDrift, sameJson } from "./drift.js";
import {
  connectionOf,
  liveEtherscanSpec,
  positionsSpec,
  pricesSpec,
  type Connections,
  type WorkflowSpec,
} from "./specs.js";

const CONNS: Connections = { ethereum: "eth-1", reactor: "reactor-1" };

const resources = {
  portfolioDocumentId: "p1",
  registryDocumentId: "r1",
  priceBookDocumentId: "b1",
  stakingDocumentId: "s1",
  walletDocumentIds: ["w1"],
};

const newIds = () => {
  let n = 0;
  return () => `n${++n}`;
};

const specFacts = (
  spec: WorkflowSpec,
  overrides: Partial<WorkflowFacts> = {},
): WorkflowFacts => {
  const triggerKind: WorkflowFacts["triggerKind"] =
    spec.trigger.kind === "interval" ? "interval" : null;
  return {
    status: "ENABLED",
    publishedVersion: 3,
    version: 3,
    name: spec.displayName,
    triggerKind,
    triggerConfig:
      spec.trigger.kind === "interval"
        ? { seconds: spec.trigger.seconds, label: spec.key }
        : null,
    steps: spec.steps.map((s, i) => ({
      id: `step-${i}`,
      name: s.name,
      action: s.action,
      config: s.config,
      timeoutSeconds: s.timeoutSeconds ?? null,
      ...connectionOf(s, CONNS),
    })),
    managedBy: null,
    // Wired as a build wires it: trigger → first step → … → last step.
    triggerId: triggerKind === "interval" ? "trigger" : null,
    edges: spec.steps.map((_, i) => ({
      id: `edge-${i}`,
      from: i === 0 ? "trigger" : `step-${i - 1}`,
      to: `step-${i}`,
    })).filter((e) => triggerKind === "interval" || e.from !== "trigger"),
    ...overrides,
  };
};

const workflowDoc = (global: unknown) => ({ state: { global } });

describe("readFacts", () => {
  it("prefers the published snapshot over the draft", () => {
    const facts = readFacts(
      workflowDoc({
        status: "ENABLED",
        version: 5,
        published: {
          version: 4,
          trigger: {
            triggerName: "on-interval",
            config: { seconds: 300, label: "k" },
          },
          steps: [
            { id: "a", name: "one", actionName: "fetch-account-state", config: {} },
          ],
        },
        steps: [
          { id: "a", name: "draft-only-step", actionName: "x" },
        ],
      }),
    );
    expect(facts.publishedVersion).toBe(4);
    expect(facts.triggerKind).toBe("interval");
    expect(facts.steps.map((s) => s.name)).toEqual(["one"]);
  });

  it("reads the published edges and the trigger id", () => {
    const facts = readFacts(
      workflowDoc({
        status: "ENABLED",
        version: 2,
        published: {
          version: 2,
          trigger: { id: "t1", triggerName: "on-interval", config: { seconds: 120 } },
          steps: [{ id: "s1", name: "poll", actionName: "fetch" }],
          edges: [{ id: "e1", from: "t1", to: "s1", port: "next", condition: null }],
        },
      }),
    );
    expect(facts.triggerId).toBe("t1");
    expect(facts.edges).toEqual([{ id: "e1", from: "t1", to: "s1" }]);
  });

  it("reads an unpublished draft", () => {
    const facts = readFacts(
      workflowDoc({ status: "DRAFT", name: "d", steps: [] }),
    );
    expect(facts.publishedVersion).toBeNull();
    expect(facts.triggerKind).toBeNull();
    expect(facts.status).toBe("DRAFT");
  });
});

describe("workflowDrift", () => {
  it("stays silent when the workflow is the spec", () => {
    const spec = liveEtherscanSpec("w1");
    const drift = workflowDrift(spec, specFacts(spec), "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences).toEqual([]);
    expect(drift.actions).toEqual([]);
  });

  it("appends a missing tail step", () => {
    const spec = liveEtherscanSpec("w1");
    const trimmed = {
      ...specFacts(spec),
      steps: specFacts(spec).steps.slice(0, -1),
    };
    const drift = workflowDrift(spec, trimmed, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences).toEqual(["the step balances was missing"]);
    // An appended step is chained to the last one: without the edge the
    // engine skips it on every run (pin never ran on live wallets).
    expect(drift.actions.map((a) => a.type)).toEqual(["ADD_STEP", "ADD_EDGE"]);
    expect(drift.actions[1]?.input).toMatchObject({ from: "step-2", to: "n1", port: "next" });
  });

  it("wires a step nothing leads to", () => {
    const spec = liveEtherscanSpec("w1");
    const facts = specFacts(spec);
    const unwired = { ...facts, edges: facts.edges.filter((e) => e.to !== "step-2") };
    const drift = workflowDrift(spec, unwired, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences).toEqual(["the step pin was not wired"]);
    expect(drift.actions.map((a) => a.type)).toEqual(["ADD_EDGE"]);
    expect(drift.actions[0]?.input).toMatchObject({ from: "step-1", to: "step-2", port: "next" });
  });

  it("wires an unreached first step to the trigger", () => {
    const spec = liveEtherscanSpec("w1");
    const facts = specFacts(spec);
    const unwired = { ...facts, edges: facts.edges.filter((e) => e.to !== "step-0") };
    const drift = workflowDrift(spec, unwired, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.actions[0]?.input).toMatchObject({ from: "trigger", to: "step-0" });
  });

  it("rebuilds a chain that no longer matches the spec, after its matching prefix", () => {
    // The live positions sweep: an older spec ended in register steps; the
    // current one has a sweep per wallet and no register steps.
    const spec = positionsSpec("p1", "reg", [
      { address: "0xa", chainId: 1 },
      { address: "0xb", chainId: 1 },
      { address: "0xc", chainId: 1 },
      { address: "0xd", chainId: 137 },
    ]);
    const names = ["sweep-1", "sweep-2", "sweep-3", "register-1", "register-2", "register-3"];
    const facts: WorkflowFacts = {
      ...specFacts(spec),
      steps: names.map((name, i) => ({
        id: `step-${i}`,
        name,
        action: name.startsWith("sweep") ? "fetch-positions" : "register-protocols",
        config: name.startsWith("sweep") ? spec.steps[i].config : {},
        timeoutSeconds: name.startsWith("sweep") ? 240 : null,
        connectionId: "eth-1",
        reactorConnectionId: "reactor-1",
      })),
      triggerId: "trigger",
      edges: names.map((_, i) => ({
        id: `edge-${i}`,
        from: i === 0 ? "trigger" : `step-${i - 1}`,
        to: `step-${i}`,
      })),
    };
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences[0]).toMatch(/rebuilt after sweep-3/);
    const types = drift.actions.map((a) => `${a.type}:${(a.input as { id?: string }).id ?? ""}`);
    // The stale tail goes: its edges, then its steps.
    expect(types.slice(0, 6)).toEqual([
      "REMOVE_EDGE:edge-3",
      "REMOVE_EDGE:edge-4",
      "REMOVE_EDGE:edge-5",
      "REMOVE_STEP:step-3",
      "REMOVE_STEP:step-4",
      "REMOVE_STEP:step-5",
    ]);
    // sweep-4 is appended and chained to sweep-3.
    const added = drift.actions.find((a) => a.type === "ADD_STEP");
    expect(added?.input).toMatchObject({ name: "sweep-4", actionName: "fetch-positions" });
    const edge = drift.actions.find((a) => a.type === "ADD_EDGE");
    const addedId = (added?.input as { id: string } | undefined)?.id;
    expect(edge?.input).toMatchObject({ from: "step-2", to: addedId });
  });

  it("rebuilds from the trigger when not even the first step matches", () => {
    const spec = liveEtherscanSpec("w1");
    const scrambled = { ...specFacts(spec), steps: specFacts(spec).steps.slice().reverse() };
    const drift = workflowDrift(spec, scrambled, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences[0]).toMatch(/rebuilt after the trigger/);
    expect(drift.actions.filter((a) => a.type === "REMOVE_STEP")).toHaveLength(4);
    expect(drift.actions.filter((a) => a.type === "ADD_STEP")).toHaveLength(4);
    const first = drift.actions.find((a) => a.type === "ADD_EDGE");
    expect(first?.input).toMatchObject({ from: "trigger" });
  });

  it("fixes a changed interval", () => {
    const spec = liveEtherscanSpec("w1");
    const facts = specFacts(spec, {
      triggerConfig: { seconds: 600, label: spec.key },
    });
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences[0]).toMatch(/10 minutes.*2 minutes/s);
    expect(drift.actions.map((a) => a.type)).toEqual(["SET_TRIGGER_CONFIG"]);
  });

  it("repairs a parked workflow", () => {
    const spec = pricesSpec(resources);
    const facts = specFacts(spec, { status: "DISABLED" });
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.actions.map((a) => a.type)).toEqual(["SET_WORKFLOW_STATUS"]);
  });

  it("publishes when the workflow never was", () => {
    const spec = pricesSpec(resources);
    const facts = specFacts(spec, { publishedVersion: null });
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.actions.map((a) => a.type)).toEqual([
      "SET_POLICY",
      "PUBLISH_WORKFLOW",
    ]);
  });

  it("repairs a step timeout wiped by hand", () => {
    const spec = liveEtherscanSpec("w1");
    const facts = specFacts(spec);
    facts.steps[0] = { ...facts.steps[0], timeoutSeconds: null };
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences[0]).toMatch(/step poll no longer read/);
    const update = drift.actions[0] as {
      type: string;
      input: Record<string, unknown>;
    };
    expect(update.input.timeoutSeconds).toBe(120);
  });

  it("re-updates an existing step whose config drifted", () => {
    const spec = pricesSpec(resources);
    const facts = specFacts(spec);
    facts.steps[2] = { ...facts.steps[2], config: { hour: "stale" } };
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences[0]).toMatch(/step prices no longer read/);
    const update = drift.actions[0] as {
      type: string;
      input: Record<string, unknown>;
    };
    expect(update.input.id).toBe("step-2");
  });

  it("re-binds a step whose connection was swapped", () => {
    const spec = pricesSpec(resources);
    const facts = specFacts(spec);
    facts.steps[0] = { ...facts.steps[0], connectionId: "other" };
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds(), CONNS);
    expect(drift.differences[0]).toMatch(/step holdings no longer read/);
    const update = drift.actions[0] as {
      type: string;
      input: Record<string, unknown>;
    };
    expect(update.input.id).toBe("step-0");
    expect(update.input.connectionId).toBe("eth-1");
    expect(update.input.reactorConnectionId).toBe("reactor-1");
  });

  it("sameJson ignores key order", () => {
    expect(sameJson({ a: 1, b: [2, { c: 3 }] }, { b: [2, { c: 3 }], a: 1 })).toBe(true);
  });
});
