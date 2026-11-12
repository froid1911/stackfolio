/**
 * Workflow plumbing for the drive app: the reconciler's workflows live in
 * the reactor's Workflows drive under stable keys, and the workflow runtime
 * lets the UI fire one by hand ("sync now") instead of waiting for its
 * schedule. The drive's own id embeds an instance suffix, so it is located
 * through the drive query rather than a constant.
 */
import { useEffect, useState } from "react";
import { gql } from "./gql.js";

interface WorkflowRow {
  id: string;
  name: string;
}

/** The newest workflow document carrying `name`; duplicates are the old,
 * switched-off claims the reconciler leaves behind on purpose. */
export function useWorkflowByName(name: string): string | undefined {
  const [workflowId, setWorkflowId] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    gql<{ DocumentDrive: { documents: { items: WorkflowRow[] } } }>(
      `query {
        DocumentDrive {
          documents(paging: { limit: 50 }) { items { id name } }
        }
      }`,
      {},
    )
      .then((drive) => {
        const workflowsDrive = drive.DocumentDrive.documents.items.find(
          (row) => row.name === "Workflows",
        );
        if (!workflowsDrive) {
          setError("the Workflows drive is not visible to this reactor");
          return undefined;
        }
        return gql<{ findDocuments: { items: WorkflowRow[] } }>(
          `query ($parentId: String!) {
            findDocuments(
              search: { type: "powerhouse/workflow", parentId: $parentId }
              paging: { limit: 200 }
            ) { items { id name } }
          }`,
          { parentId: workflowsDrive.id },
        ).then((data) => {
          if (cancelled) return;
          const match = data.findDocuments.items
            .filter((row) => row.name === name)
            .at(-1);
          if (match) setWorkflowId(match.id);
          else setError(`no workflow named ${name}`);
        });
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [name]);
  useEffect(() => {
    if (error) console.warn(`workflow lookup "${name}": ${error}`);
  }, [name, error]);
  return workflowId;
}

export interface FireResult {
  runId: string;
  status: string;
  error: string | null;
}

/** Start a run now. `fire` answers as soon as the run is booked; the step
 * work happens in the background. The interval trigger hands the workflow
 * a `firedAt` stamp through its payload; a manual fire must supply the
 * same or every `{{trigger.payload.firedAt}}` reference fails unresolved. */
export async function fireWorkflow(workflowId: string): Promise<FireResult> {
  const data = await gql<{
    workflowRuntime: { fire: FireResult };
  }>(
    `mutation ($workflowId: String!, $payload: Unknown) {
      workflowRuntime {
        fire(workflowId: $workflowId, payload: $payload) {
          runId
          status
          error
          errorName
        }
      }
    }`,
    { workflowId, payload: { firedAt: new Date().toISOString() } },
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
