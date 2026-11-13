/**
 * What the reconciler would change to make a published workflow the spec
 * again. Pure: spec in, facts in, actions out; the caller dispatches.
 */
import type {
  Connections,
  StepSpec,
  WorkflowAction,
  WorkflowSpec,
} from "./specs.js";
import {
  connectionOf,
  ETHEREUM_PIECE_NAME,
  ETHEREUM_PIECE_VERSION,
  REACTOR_PIECE_NAME,
  STEP_RETRY,
} from "./specs.js";
import { actions as wf } from "@powerhousedao/workflow/document-models/workflow";
import type { WorkflowFacts } from "./facts.js";

export type Drift = {
  /** In the user's words, for the fixes log. */
  differences: string[];
  /** What to dispatch to end the differences. */
  actions: WorkflowAction[];
};

export const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

function humanSeconds(seconds: number): string {
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

/**
 * How the published chain lines up with the spec: the longest prefix of
 * published steps that reads as the spec's first steps is kept; published
 * steps after it are `stale` (an older spec's, or a reorder), and the
 * spec's steps after it are `steps` to append.
 */
function missingSteps(
  spec: WorkflowSpec,
  facts: WorkflowFacts,
): { after: string | null; steps: StepSpec[]; stale: WorkflowFacts["steps"] } | null {
  let kept = 0;
  while (
    kept < facts.steps.length &&
    kept < spec.steps.length &&
    facts.steps[kept].name === spec.steps[kept].name
  ) {
    kept += 1;
  }
  const stale = facts.steps.slice(kept);
  const rest = spec.steps.slice(kept);
  if (stale.length === 0 && rest.length === 0) return null;
  return { after: kept > 0 ? facts.steps[kept - 1].name : null, steps: rest, stale };
}

/**
 * What to change so the published workflow is the spec again. The caller
 * stamps publish times with `now`; ids come from `newId`, never from a
 * clock or a random source inside this module.
 */
export function workflowDrift(
  spec: WorkflowSpec,
  facts: WorkflowFacts,
  now: string,
  newId: () => string,
  connections: Connections,
  reactorPieceVersion = "0.0.0",
  stalled = false,
): Drift {
  const differences: string[] = [];
  const actions: WorkflowAction[] = [];

  const missing = missingSteps(spec, facts);
  // A chain that stopped matching (an older spec's steps, a reorder) is
  // rebuilt after its matching prefix: the reconciler manages these
  // workflows and wrote their chains, so leaving one stuck helps nobody.
  const staleIds = new Set((missing?.stale ?? []).map((s) => s.id));
  if (missing && missing.stale.length > 0) {
    differences.push(
      `the step chain no longer matched the spec and was rebuilt after ${missing.after ?? "the trigger"}`,
    );
    for (const edge of facts.edges) {
      if (staleIds.has(edge.from) || staleIds.has(edge.to)) {
        actions.push(wf.removeEdge({ id: edge.id }));
      }
    }
    for (const step of missing.stale) actions.push(wf.removeStep({ id: step.id }));
  } else if (missing) {
    for (const step of missing.steps) {
      differences.push(`the step ${step.name} was missing`);
    }
  }
  const liveSteps = facts.steps.filter((s) => !staleIds.has(s.id));
  const liveEdges = facts.edges.filter((e) => !staleIds.has(e.from) && !staleIds.has(e.to));
  // Ids of the spec's steps as they will stand: kept ones by name,
  // appended ones as they are minted below.
  const stepIdByName = new Map(liveSteps.map((s) => [s.name, s.id]));
  for (const step of missing?.steps ?? []) {
    const id = newId();
    stepIdByName.set(step.name, id);
    actions.push(
      wf.addStep({
        id,
        key: step.name,
        name: step.name,
        ...pieceOf(step, reactorPieceVersion),
        ...connectionOf(step, connections),
        actionName: step.action,
        config: step.config,
        ...(step.timeoutSeconds != null
          ? { timeoutSeconds: step.timeoutSeconds }
          : {}),
      }),
    );
  }

  // Every step needs a "next" edge into it, from the trigger (first step of
  // an interval workflow) or the step before; a step nothing leads to is
  // skipped on every run. Appending a step used to add no edge, so live
  // wallets' pin step never ran.
  const reached = new Set(liveEdges.map((e) => e.to));
  spec.steps.forEach((step, i) => {
    const id = stepIdByName.get(step.name);
    if (!id || reached.has(id)) return;
    const from =
      i === 0
        ? spec.trigger.kind === "interval"
          ? facts.triggerId
          : null
        : (stepIdByName.get(spec.steps[i - 1].name) ?? null);
    if (!from) return;
    const appended = missing?.steps.some((m) => m.name === step.name) ?? false;
    if (!appended) differences.push(`the step ${step.name} was not wired`);
    actions.push(wf.addEdge({ id: newId(), from, to: id, port: "next" }));
  });

  // Steps the workflow keeps: settings must read as the spec says.
  const have = new Map(liveSteps.map((s) => [s.name, s]));
  for (const step of spec.steps) {
    const existing = have.get(step.name);
    if (!existing) continue;
    const binding = connectionOf(step, connections);
    if (
      existing.action === step.action &&
      sameJson(existing.config ?? {}, step.config) &&
      (existing.connectionId ?? null) === binding.connectionId &&
      (existing.reactorConnectionId ?? null) === binding.reactorConnectionId &&
      (existing.timeoutSeconds ?? null) === (step.timeoutSeconds ?? null)
    ) {
      continue;
    }
    differences.push(`the step ${step.name} no longer read as the spec has it`);
    actions.push(
      wf.updateStep({
        id: existing.id,
        key: step.name,
        name: step.name,
        ...pieceOf(step, reactorPieceVersion),
        ...binding,
        actionName: step.action,
        config: step.config,
        ...(step.timeoutSeconds != null
          ? { timeoutSeconds: step.timeoutSeconds }
          : {}),
      }),
    );
  }
  if (spec.trigger.kind === "interval") {
    if (facts.triggerKind !== "interval") {
      differences.push("the interval trigger was missing");
      actions.push(
        wf.setTrigger({
          id: newId(),
          pieceName: ETHEREUM_PIECE_NAME,
          pieceVersion: ETHEREUM_PIECE_VERSION,
          triggerName: "on-interval",
          config: { seconds: spec.trigger.seconds, label: spec.key },
        }),
      );
    } else {
      const wanted = { seconds: spec.trigger.seconds, label: spec.key };
      if (!sameJson(facts.triggerConfig ?? {}, wanted)) {
        differences.push(
          `the trigger ran on ${humanSeconds(
            typeof facts.triggerConfig?.seconds === "number"
              ? facts.triggerConfig.seconds
              : 0,
          )}, now on ${humanSeconds(spec.trigger.seconds)}`,
        );
        actions.push(wf.setTriggerConfig({ config: wanted }));
      } else if (stalled) {
        // The engine parks a workflow after a failed run and never
        // re-arms it from the document. Re-sending the trigger config
        // bumps the version, which is exactly what lifts the park.
        differences.push("was re-armed after a stalled schedule");
        actions.push(wf.setTriggerConfig({ config: wanted }));
      }
    }
  } else if (facts.triggerKind !== null) {
    differences.push("a manual workflow had a trigger bound");
    actions.push(wf.clearTrigger({}));
  }

  if (facts.publishedVersion === null || facts.publishedVersion < facts.version) {
    differences.push("the workflow was not published");
    actions.push(
      wf.setPolicy({ defaultRetry: STEP_RETRY }),
      wf.publishWorkflow({ publishedAt: now }),
    );
  }

  if (facts.status === "DISABLED") {
    differences.push("the workflow was switched off");
    actions.push(wf.setWorkflowStatus({ status: "ENABLED" }));
  }

  return { differences, actions };
}

function pieceOf(
  step: StepSpec,
  reactorPieceVersion: string,
): { pieceName: string; pieceVersion: string } {
  return step.piece === "reactor"
    ? {
        pieceName: REACTOR_PIECE_NAME,
        pieceVersion: reactorPieceVersion,
      }
    : {
        pieceName: ETHEREUM_PIECE_NAME,
        pieceVersion: ETHEREUM_PIECE_VERSION,
      };
}
