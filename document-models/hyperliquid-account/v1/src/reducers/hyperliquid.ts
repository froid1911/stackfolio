import type { HyperliquidAccountHyperliquidOperations } from "document-models/hyperliquid-account/v1";
import {
  EntityNotFoundError,
  InvalidInputError,
} from "../../gen/hyperliquid/error.js";

export const hyperliquidAccountHyperliquidOperations: HyperliquidAccountHyperliquidOperations =
  {
    upsertAccountOperation(state, action) {
      const address = action.input.address.toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(address)) {
        throw new InvalidInputError(
          "address must be a 0x-prefixed 40-hex-character address",
        );
      }
      const existing = state.accounts.find(
        (account) => account.address === address,
      );
      if (existing) {
        existing.label = action.input.label ?? existing.label;
      } else {
        state.accounts.push({
          address,
          label: action.input.label ?? null,
          accountValueUsd: null,
          spot: [],
          perps: [],
          fills: [],
          updatedAt: null,
        });
      }
    },
    recordSnapshotOperation(state, action) {
      const address = action.input.address.toLowerCase();
      const account = state.accounts.find((entry) => entry.address === address);
      if (!account) {
        throw new EntityNotFoundError(`no Hyperliquid account ${address}`);
      }
      account.accountValueUsd = action.input.accountValueUsd ?? null;
      account.spot = action.input.spot.map((balance) => ({
        tokenIndex: balance.tokenIndex,
        coin: balance.coin,
        total: balance.total,
        hold: balance.hold,
      }));
      account.perps = action.input.perps.map((position) => ({
        coin: position.coin,
        szi: position.szi,
        entryPx: position.entryPx,
        positionValue: position.positionValue,
        unrealizedPnl: position.unrealizedPnl,
      }));
      account.fills = [...action.input.fills]
        .sort((left, right) => right.time - left.time || right.tid - left.tid)
        .slice(0, 500)
        .map((fill) => ({
          tid: fill.tid,
          coin: fill.coin,
          side: fill.side,
          px: fill.px,
          sz: fill.sz,
          time: fill.time,
          dir: fill.dir ?? null,
          fee: fill.fee ?? null,
          closedPnl: fill.closedPnl ?? null,
        }));
      account.updatedAt = action.input.updatedAt;
    },
  };
