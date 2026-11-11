import { describe, expect, it } from "vitest";

import { readFacts, type WorkflowFacts } from "./facts.js";
import { workflowDrift, sameJson } from "./drift.js";
import { liveScanSpec, pricesSpec, type WorkflowSpec } from "./specs.js";

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
    })),
    managedBy: null,
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
    const spec = liveScanSpec("w1");
    const drift = workflowDrift(spec, specFacts(spec), "2026-11-11T00:00:00.000Z", newIds());
    expect(drift.differences).toEqual([]);
    expect(drift.actions).toEqual([]);
  });

  it("appends a missing tail step", () => {
    const spec = liveScanSpec("w1");
    const trimmed = {
      ...specFacts(spec),
      steps: specFacts(spec).steps.slice(0, -1),
    };
    const drift = workflowDrift(spec, trimmed, "2026-11-11T00:00:00.000Z", newIds());
    expect(drift.differences).toEqual(["the step import-native was missing"]);
    expect(drift.actions.map((a) => a.type)).toEqual(["ADD_STEP"]);
  });

  it("refuses to repair a hand-edited chain", () => {
    const spec = liveScanSpec("w1");
    const scrambled = {
      ...specFacts(spec),
      steps: specFacts(spec).steps.slice().reverse(),
    };
    const drift = workflowDrift(spec, scrambled, "2026-11-11T00:00:00.000Z", newIds());
    expect(drift.actions).toEqual([]);
    expect(drift.differences[0]).toMatch(/edited by hand/);
  });

  it("fixes a changed interval", () => {
    const spec = liveScanSpec("w1");
    const facts = specFacts(spec, {
      triggerConfig: { seconds: 600, label: spec.key },
    });
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds());
    expect(drift.differences[0]).toMatch(/10 minutes.*5 minutes/s);
    expect(drift.actions.map((a) => a.type)).toEqual(["SET_TRIGGER_CONFIG"]);
  });

  it("repairs a parked workflow", () => {
    const spec = pricesSpec(resources);
    const facts = specFacts(spec, { status: "DISABLED" });
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds());
    expect(drift.actions.map((a) => a.type)).toEqual(["SET_WORKFLOW_STATUS"]);
  });

  it("publishes when the workflow never was", () => {
    const spec = pricesSpec(resources);
    const facts = specFacts(spec, { publishedVersion: null });
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds());
    expect(drift.actions.map((a) => a.type)).toEqual([
      "SET_POLICY",
      "PUBLISH_WORKFLOW",
    ]);
  });

  it("re-updates an existing step whose config drifted", () => {
    const spec = pricesSpec(resources);
    const facts = specFacts(spec);
    facts.steps[2] = { ...facts.steps[2], config: { hour: "stale" } };
    const drift = workflowDrift(spec, facts, "2026-11-11T00:00:00.000Z", newIds());
    expect(drift.differences[0]).toMatch(/step prices no longer read/);
    const update = drift.actions[0] as {
      type: string;
      input: Record<string, unknown>;
    };
    expect(update.input.id).toBe("step-2");
  });

  it("sameJson ignores key order", () => {
    expect(sameJson({ a: 1, b: [2, { c: 3 }] }, { b: [2, { c: 3 }], a: 1 })).toBe(true);
  });
});
