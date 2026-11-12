import type {
  PortfolioPositionsOperations,
  WalletPositions,
} from "document-models/portfolio/v1";

export const portfolioPositionsOperations: PortfolioPositionsOperations = {
  setPositionsOperation(state, action) {
    const entry: WalletPositions = {
      wallet: action.input.wallet,
      chainId: action.input.chainId,
      fetchedAt: action.input.fetchedAt,
      positions: action.input.positions.map((position) => ({
        protocol: position.protocol,
        kind: position.kind,
        assets: position.assets.map((asset) => ({
          asset: asset.asset,
          amount: asset.amount,
        })),
        note: position.note ?? null,
      })),
    };
    // Documents created before the positions field existed carry no key
    // at all; without this backfill SET_POSITIONS throws and the whole
    // sweep fails on them.
    if (!Array.isArray(state.positions)) {
      state.positions = [];
    }
    const index = state.positions.findIndex(
      (p) =>
        p.wallet === action.input.wallet && p.chainId === action.input.chainId,
    );
    if (index === -1) {
      state.positions.push(entry);
    } else {
      state.positions[index] = entry;
    }
  },
};
