/**
 * Workflow plumbing for the drive app: the reconciler's workflows live in
 * the reactor's Workflows drive under stable keys, and the workflow runtime
 * lets the UI fire one by hand ("sync now") instead of waiting for its
 * schedule.
 */
import { useDrives } from "@powerhousedao/reactor-browser";
import { useEffect, useState } from "react";
import { gql } from "./gql.js";

interface WorkflowRow {
  id: string;
  name: string;
}

/** The newest workflow document carrying `name`; duplicates are the old,
 * switched-off claims the reconciler leaves behind on purpose. */
export function useWorkflowByName(name: string): string | undefined {
  const drives = useDrives();
  const [workflowId, setWorkflowId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const workflowsDrive = (drives ?? []).find(
      (drive) => drive.header.name === "Workflows",
    );
    if (!workflowsDrive) return;
    let cancelled = false;
    gql<{ findDocuments: { items: WorkflowRow[] } }>(
      `query ($parentId: String!) {
        findDocuments(
          search: { type: "powerhouse/workflow", parentId: $parentId }
          paging: { limit: 200 }
        ) { items { id name } }
      }`,
      { parentId: workflowsDrive.header.id },
    )
      .then((data) => {
        if (cancelled) return;
        const match = data.findDocuments.items
          .filter((row) => row.name === name)
          .at(-1);
        if (match) setWorkflowId(match.id);
      })
      .catch(() => {
        /* no workflows drive within reach; the button stays disabled */
      });
    return () => {
      cancelled = true;
    };
  }, [drives, name]);
  return workflowId;
}

export interface FireResult {
  runId: string;
  status: string;
  error: string | null;
}

/** Start a run now. `fire` answers as soon as the run is booked; the step
 * work happens in the background. */
export async function fireWorkflow(workflowId: string): Promise<FireResult> {
  const data = await gql<{
    workflowRuntime: { fire: FireResult };
  }>(
    `mutation ($workflowId: String!) {
      workflowRuntime {
        fire(workflowId: $workflowId) { runId status error errorName }
      }
    }`,
    { workflowId },
  );
  return data.workflowRuntime.fire;
}

/** Remove a wallet-account document from the drive: the account and its
 * ledger are gone; the reconciler retires its workflows on the next pass. */
export async function deleteAccount(id: string): Promise<void> {
  await gql<{ deleteDocument: boolean }>(
    `mutation ($id: String!) { deleteDocument(idOrSlug: $id, propagate: false) }`,
    { id },
  );
}
