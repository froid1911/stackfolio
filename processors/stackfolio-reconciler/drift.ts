/**
 * What the reconciler would change to make a published workflow the spec
 * again. Pure: spec in, facts in, actions out; the caller dispatches.
 */
import type { StepSpec, WorkflowAction, WorkflowSpec } from "./specs.js";
import {
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
 * The steps the spec ends with that the workflow lacks, in order - only a
 * missing tail is repairable; anything else means someone edited the chain
 * and the reconciler will not guess.
 */
function missingSteps(
  spec: WorkflowSpec,
  facts: WorkflowFacts,
): { after: string | null; steps: StepSpec[] } | "stuck" | null {
  const have = facts.steps.map((s) => s.name);
  const want = spec.steps.map((s) => s.name);
  if (sameJson(want.slice(0, have.length), have)) {
    const rest = spec.steps.slice(have.length);
    return rest.length > 0
      ? { after: have.length > 0 ? have[have.length - 1] : null, steps: rest }
      : null;
  }
  // The published steps are not a prefix of the spec: a middle step was
  // removed or reordered.
  return "stuck";
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
  reactorPieceVersion = "0.0.0",
): Drift {
  const differences: string[] = [];
  const actions: WorkflowAction[] = [];

  const missing = missingSteps(spec, facts);
  if (missing === "stuck") {
    differences.push(
      `${spec.displayName}: the step chain was edited by hand and cannot be repaired automatically`,
    );
    return { differences, actions };
  }
  if (missing) {
    for (const step of missing.steps) {
      differences.push(`the step ${step.name} was missing`);
    }
  }
  for (const step of missing?.steps ?? []) {
    actions.push(
      wf.addStep({
        id: newId(),
        key: step.name,
        name: step.name,
        ...pieceOf(step, reactorPieceVersion),
        actionName: step.action,
        config: step.config,
      }),
    );
  }

  // Steps the workflow already has: settings must read as the spec says.
  const have = new Map(facts.steps.map((s) => [s.name, s]));
  for (const step of spec.steps) {
    const existing = have.get(step.name);
    if (!existing) continue;
    if (
      existing.action === step.action &&
      sameJson(existing.config ?? {}, step.config)
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
        actionName: step.action,
        config: step.config,
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
