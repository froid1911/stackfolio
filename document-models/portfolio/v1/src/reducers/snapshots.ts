import type { PortfolioSnapshotsOperations } from "document-models/portfolio/v1";
import {
  InvalidAmountError,
  SnapshotEmptyError,
  SnapshotNotFoundError,
} from "../../gen/snapshots/error.js";

export const portfolioSnapshotsOperations: PortfolioSnapshotsOperations = {
  takeSnapshotOperation(state, action) {
    const isDecimal = (value: string) =>
      /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value);
    // Ledger-derived holdings can net negative when a wallet's history
    // cannot account every inflow (internal transfers are invisible
    // without traces); the snapshot records that honestly instead of
    // losing the asset.
    const isSignedDecimal = (value: string) =>
      /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value);
    if (
      action.input.perLocation.length === 0 &&
      action.input.perAsset.length === 0
    ) {
      throw new SnapshotEmptyError(
        "A snapshot needs at least one location or asset value",
      );
    }
    const signedAmounts = [
      action.input.totalValue,
      ...action.input.perLocation.map((l) => l.value),
      ...action.input.perAsset.flatMap((a) => [a.amount, a.value]),
    ];
    for (const amount of signedAmounts) {
      if (!isSignedDecimal(amount))
        throw new InvalidAmountError(`${amount} is not a decimal amount`);
    }
    for (const liability of action.input.liabilities ?? []) {
      if (!isDecimal(liability.amount))
        throw new InvalidAmountError(
          `${liability.amount} is not a decimal amount`,
        );
    }
    if (
      action.input.netWorth != null &&
      !/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(action.input.netWorth)
    ) {
      throw new InvalidAmountError(
        `${action.input.netWorth} is not a decimal amount`,
      );
    }
    // The id is the snapshot's identity: a re-run of a timed step re-takes
    // the same timestamp, and that replaces the stored snapshot instead of
    // appending a second row with one id - the read model upserts by id and
    // two rows for one id break the insert.
    const snapshot = {
      id: action.input.id,
      timestamp: action.input.timestamp,
      totalValue: action.input.totalValue,
      netWorth: action.input.netWorth ?? null,
      liabilities: action.input.liabilities ?? [],
      perLocation: action.input.perLocation,
      perAsset: action.input.perAsset,
    };
    const at = state.snapshots.findIndex((s) => s.id === action.input.id);
    if (at === -1) state.snapshots.push(snapshot);
    else state.snapshots[at] = snapshot;
  },
  deleteSnapshotOperation(state, action) {
    const index = state.snapshots.findIndex((s) => s.id === action.input.id);
    if (index === -1)
      throw new SnapshotNotFoundError(
        `Snapshot ${action.input.id} does not exist`,
      );
    state.snapshots.splice(index, 1);
  },
};
