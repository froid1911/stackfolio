import type {
  CategoryOverride,
  CategoryRule,
  PortfolioCategoriesOperations,
  PortfolioState,
} from "document-models/portfolio/v1";
import {
  CategoryRuleNotFoundError,
  InvalidCounterpartyError,
  InvalidGiftBasisError,
} from "../../gen/categories/error.js";

/** Documents made before categories carry neither list. */
function lists(state: PortfolioState): {
  rules: CategoryRule[];
  overrides: CategoryOverride[];
} {
  const loaded = state as Partial<PortfolioState>;
  if (!loaded.categoryRules) loaded.categoryRules = [];
  if (!loaded.categoryOverrides) loaded.categoryOverrides = [];
  return { rules: loaded.categoryRules, overrides: loaded.categoryOverrides };
}

const keyOf = (o: { wallet: string; eventId: string; sequenceIndex: number }) =>
  `${o.wallet.toLowerCase()}|${o.eventId}|${o.sequenceIndex}`;

export const portfolioCategoriesOperations: PortfolioCategoriesOperations = {
  addCategoryRuleOperation(state, action) {
    const counterparty = action.input.counterparty.trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(counterparty)) {
      throw new InvalidCounterpartyError(
        `${action.input.counterparty} is not an address`,
      );
    }
    lists(state).rules.push({
      id: action.input.id,
      counterparty,
      chainId: action.input.chainId ?? null,
      direction: action.input.direction,
      asset: action.input.asset ?? null,
      category: action.input.category,
      label: action.input.label?.trim() || null,
    });
  },
  updateCategoryRuleOperation(state, action) {
    const rule = lists(state).rules.find((r) => r.id === action.input.id);
    if (!rule) {
      throw new CategoryRuleNotFoundError(
        `Rule ${action.input.id} does not exist`,
      );
    }
    if (action.input.category != null) rule.category = action.input.category;
    if (action.input.direction != null) rule.direction = action.input.direction;
    if (action.input.label != null) {
      rule.label = action.input.label.trim() || null;
    }
  },
  removeCategoryRuleOperation(state, action) {
    const { rules } = lists(state);
    const index = rules.findIndex((r) => r.id === action.input.id);
    if (index === -1) {
      throw new CategoryRuleNotFoundError(
        `Rule ${action.input.id} does not exist`,
      );
    }
    rules.splice(index, 1);
  },
  setEventCategoriesOperation(state, action) {
    const { overrides } = lists(state);
    for (const o of action.input.overrides) {
      const gift = o.giftCost != null || o.giftAcquiredAt != null;
      if (gift && o.category !== "GIFT_IN") {
        throw new InvalidGiftBasisError(
          "Gift cost and date belong on a GIFT_IN override only",
        );
      }
      if (
        o.giftCost != null &&
        !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(o.giftCost)
      ) {
        throw new InvalidGiftBasisError(
          `Gift cost ${o.giftCost} is not a decimal`,
        );
      }
    }
    for (const o of action.input.overrides) {
      const next: CategoryOverride = {
        wallet: o.wallet.toLowerCase(),
        eventId: o.eventId,
        sequenceIndex: o.sequenceIndex,
        category: o.category,
        giftCost: o.giftCost ?? null,
        giftAcquiredAt: o.giftAcquiredAt ?? null,
      };
      const index = overrides.findIndex((held) => keyOf(held) === keyOf(next));
      if (index === -1) overrides.push(next);
      else overrides[index] = next;
    }
  },
  clearEventCategoriesOperation(state, action) {
    const { overrides } = lists(state);
    const gone = new Set(action.input.events.map(keyOf));
    const kept = overrides.filter((o) => !gone.has(keyOf(o)));
    overrides.splice(0, overrides.length, ...kept);
  },
  setAssetTrustedOperation(state, action) {
    if (!state.trustedAssets) state.trustedAssets = [];
    if (action.input.trusted) {
      if (!state.trustedAssets.includes(action.input.asset))
        state.trustedAssets.push(action.input.asset);
    } else {
      state.trustedAssets = state.trustedAssets.filter(
        (a) => a !== action.input.asset,
      );
    }
  },
};
