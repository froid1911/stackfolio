import type { PortfolioReconcilerOperations } from "document-models/portfolio/v1";

export const portfolioReconcilerOperations: PortfolioReconcilerOperations = {
  recordResourcesOperation(state, action) {
    state.resources = {
      connectionId: action.input.connectionId,
      workflowIds: action.input.workflowIds,
    };
  },
  recordCheckOperation(state, action) {
    state.lastCheck = {
      at: action.input.at,
      issues: action.input.issues.map((i) => ({
        code: i.code,
        severity: i.severity,
        message: i.message,
        accountId: i.accountId ?? null,
      })),
      fixes: action.input.fixes,
    };
  },
  setGrantOperation(state, action) {
    state.grant = {
      id: action.input.id,
      name: action.input.name ?? null,
      grantedAt: action.input.grantedAt ?? null,
    };
  },
  clearGrantOperation(state, _action) {
    state.grant = null;
  },
};
