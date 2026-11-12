import { actions, reducer, utils } from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const { recordResources, recordCheck, setGrant, clearGrant } = actions;

describe("ReconcilerOperations", () => {
  it("should handle recordResources operation", () => {
    let document = reducer(
      utils.createDocument(),
      recordResources({ connectionId: "conn-1", workflowIds: ["wf-1"] }),
    );
    document = reducer(
      document,
      recordResources({
        connectionId: "conn-1",
        workflowIds: ["wf-1", "wf-2"],
      }),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.resources).toEqual({
      connectionId: "conn-1",
      workflowIds: ["wf-1", "wf-2"],
    });
  });

  it("should handle recordCheck operation", () => {
    const document = reducer(
      utils.createDocument(),
      recordCheck({
        at: "2026-11-11T12:00:00.000Z",
        issues: [
          {
            code: "WORKFLOW_MISSING",
            severity: "BLOCKING",
            message: "Import workflow is gone",
            accountId: "acc-1",
          },
          {
            code: "STALE_BACKFILL",
            severity: "WARNING",
            message: "Last backfill is old",
          },
        ],
        fixes: [
          {
            code: "WORKFLOW_RECREATED",
            message: "Recreated the import workflow",
            at: "2026-11-11T12:00:05.000Z",
          },
        ],
      }),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    const check = document.state.global.lastCheck;
    expect(check?.issues).toHaveLength(2);
    expect(check?.issues[1].accountId).toBeNull();
    expect(check?.fixes[0].code).toBe("WORKFLOW_RECREATED");
  });

  it("should handle setGrant operation", () => {
    const document = reducer(
      utils.createDocument(),
      setGrant({
        id: "grant-1",
        name: "Stackfolio reconciler",
        grantedAt: "2026-11-11T00:00:00.000Z",
      }),
    );

    expect(document.state.global.grant).toEqual({
      id: "grant-1",
      name: "Stackfolio reconciler",
      grantedAt: "2026-11-11T00:00:00.000Z",
    });
  });

  it("should accept a grant without name or date", () => {
    const document = reducer(
      utils.createDocument(),
      setGrant({ id: "grant-2", name: null, grantedAt: null }),
    );

    expect(document.state.global.grant).toEqual({
      id: "grant-2",
      name: null,
      grantedAt: null,
    });
  });

  it("should handle clearGrant operation", () => {
    let document = reducer(
      utils.createDocument(),
      setGrant({ id: "grant-1", name: "Reconciler", grantedAt: null }),
    );
    document = reducer(document, clearGrant({ _empty: true }));

    expect(document.state.global.grant).toBeNull();
  });
});
