/**
 * A workflow document as the specs understand it: the published snapshot
 * when there is one (that is what the runtime fires), the draft otherwise.
 * Pure reads over whatever `reactor.get` returned.
 */

export type WorkflowFacts = {
  status: string;
  /** null: never published */
  publishedVersion: number | null;
  version: number;
  name: string | null;
  /** null: no trigger bound (manual workflow) */
  triggerKind: "interval" | "manual" | null;
  triggerConfig: Record<string, unknown> | null;
  /** The published steps: id, name and action, in document order. */
  steps: Array<{
    id: string;
    name: string;
    action: string;
    config: Record<string, unknown> | null;
    connectionId: string | null;
    reactorConnectionId: string | null;
    timeoutSeconds: number | null;
  }>;
  /** The document that manages it (managedBy.documentId); null: nobody */
  managedBy: string | null;
};

/** One checked boundary read: everything a reactor document carries is
 * untyped data until a reader like this narrows it. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readSteps(
  steps: unknown,
): Array<{
  id: string;
  name: string;
  action: string;
  config: Record<string, unknown> | null;
  connectionId: string | null;
  reactorConnectionId: string | null;
  timeoutSeconds: number | null;
}> {
  if (!Array.isArray(steps)) return [];
  const out: Array<{
    id: string;
    name: string;
    action: string;
    config: Record<string, unknown> | null;
    connectionId: string | null;
    reactorConnectionId: string | null;
    timeoutSeconds: number | null;
  }> = [];
  for (const entry of steps) {
    const step = asRecord(entry);
    const name = readString(step?.name);
    if (name === null) continue;
    out.push({
      id: readString(step?.id) ?? "",
      name,
      action: readString(step?.actionName) ?? "",
      config: asRecord(step?.config),
      connectionId: readString(step?.connectionId),
      reactorConnectionId: readString(step?.reactorConnectionId),
      timeoutSeconds:
        typeof step?.timeoutSeconds === "number" ? step.timeoutSeconds : null,
    });
  }
  return out;
}

function readTrigger(trigger: unknown): {
  triggerKind: "interval" | "manual" | null;
  triggerConfig: Record<string, unknown> | null;
} {
  const binding = asRecord(trigger);
  const triggerName = readString(binding?.triggerName);
  if (triggerName === null) {
    return { triggerKind: null, triggerConfig: null };
  }
  return {
    triggerKind: triggerName === "on-interval" ? "interval" : "manual",
    triggerConfig: asRecord(binding?.config),
  };
}

export function readFacts(doc: { state: unknown }): WorkflowFacts {
  const stateRecord = asRecord(doc.state);
  const state =
    (stateRecord && "global" in stateRecord
      ? asRecord(stateRecord.global)
      : stateRecord) ?? {};
  const published = asRecord(state.published);
  const view = published ?? state;
  const { triggerKind, triggerConfig } = readTrigger(view.trigger);
  const version =
    typeof state.version === "number" ? state.version : 1;
  return {
    status: readString(state.status) ?? "DRAFT",
    publishedVersion:
      published && typeof published.version === "number"
        ? published.version
        : null,
    version,
    name: readString(state.name),
    triggerKind,
    triggerConfig,
    steps: readSteps(view.steps),
    managedBy: readString(asRecord(state.managedBy)?.documentId),
  };
}
