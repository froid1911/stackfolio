# Tax Categories, Part 1: Model, Classifier, Books — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ledger event gets a CoinTracking-style tax category (override › rule › derived default › unclassified), and the accounting fold books each category under German rules.

**Architecture:** Rules and overrides live in the portfolio document (new `categories` module). A pure classifier in `processors/shared/categories.ts` resolves each event's category per transaction. The accounting index stages rules/overrides like ignored assets, classifies before folding, books by category, and persists each event's resolved category for the subgraph.

**Tech Stack:** TypeScript, Powerhouse document models (reactor-mcp + Vetra codegen), Kysely/PGlite processors, GraphQL subgraph, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-tax-categories-design.md` (sections 1–2). Parts 2 (review queue) and 3 (tax report) get their own plans.

## Global Constraints

- Never edit `gen/` folders or `.ph/`; change models through reactor-mcp (`SET_STATE_SCHEMA`, `ADD_MODULE`, `ADD_OPERATION`, `ADD_OPERATION_ERROR`, `SET_OPERATION_REDUCER`) and in `document-models/<name>/v1/src/reducers/`.
- After `addActions` on a model, call `getCodegenStatus` with `waitSeconds: 60`. If codegen fails with "Directory not found …/gen/<module>", run `NODE_OPTIONS="--require <scratchpad>/tolerate-missing-dir.cjs" pnpm exec ph-cli generate document-model --dir portfolio` (the shim lists a missing `gen/` folder as empty).
- New/untracked reducer and test files must be committed before Vetra's codegen runs again, or it overwrites them with stubs.
- Checks after each task: `npm run tsc`, `npm run lint:fix`, `npm run test:coverage` (reducers ≥ 95%).
- Pieces load from `dist/`: `npm run build` then `restartVetra` before live checks.
- Commits: no Claude attribution or Co-Authored-By trailers.
- Category names (enum `TxCategory`): TRADE, SPEND, INCOME, STAKING, LENDING_INCOME, MINING, AIRDROP, AIRDROP_NON_TAXABLE, GIFT_IN, GIFT_OUT, DONATION, LOST, STOLEN, DEPOSIT, WITHDRAWAL, COLLATERAL_OUT, COLLATERAL_IN, BORROWING, LOAN_REPAYMENT, LIQUIDATION, FEE, MARGIN. UNCLASSIFIED is a classifier result only, never stored.

## File Structure

- `document-models/portfolio/v1/src/reducers/categories.ts` — rule/override reducers (new).
- `document-models/portfolio/v1/tests/categories.test.ts` — reducer tests (new).
- `processors/shared/categories.ts` — `classify()`: the one resolution function (new).
- `processors/shared/categories.test.ts` — classifier tests (new).
- `processors/accounting-index/fold.ts` — books by `event.category`; lots carry `acquiredAt`; departures list.
- `processors/accounting-index/fold.test.ts` — category tests.
- `processors/accounting-index/{migrations,schema,stage,processor}.ts` — stage rules/overrides, persist `acc_event_categories`, FOLD_VERSION 5.
- `subgraphs/portfolio-api/{schema,resolvers,lib}.ts` — `category`, `categorySource` on events; `categories` filter.

---

### Task 1: Portfolio `categories` module

**Files:**
- Model via reactor-mcp on document `OrBx7YuzcS1H5Lu3rJXPdp913DSFct9rkODYgt-3lMg` (Portfolio model in drive `vetra-2b8f6c4a`)
- Create: `document-models/portfolio/v1/src/reducers/categories.ts`
- Create: `document-models/portfolio/v1/tests/categories.test.ts`

**Interfaces:**
- Produces: portfolio state `categoryRules: CategoryRule[]`, `categoryOverrides: CategoryOverride[]`; actions `addCategoryRule`, `updateCategoryRule`, `removeCategoryRule`, `setEventCategories`, `clearEventCategories`.

- [ ] **Step 1: Read the current state schema**

Call `getDocumentModelSchema` with `type: "stackfolio/portfolio"`, `state: "global"`. Keep the exact text; Step 2 appends to it.

- [ ] **Step 2: Apply the model change (one `addActions` batch)**

`SET_STATE_SCHEMA` (scope global): the current schema with two fields added to `PortfolioState`:

```graphql
  categoryRules: [CategoryRule!]!
  categoryOverrides: [CategoryOverride!]!
```

and these types appended:

```graphql
"""A counterparty rule: every matching transaction gets the category."""
type CategoryRule {
  id: OID!
  counterparty: String!
  chainId: Int
  direction: CategoryDirection!
  asset: String
  category: TxCategory!
  label: String
}

"""One transaction's category, chosen by hand."""
type CategoryOverride {
  wallet: String!
  eventId: String!
  sequenceIndex: Int!
  category: TxCategory!
  giftCost: String
  giftAcquiredAt: DateTime
}

enum CategoryDirection { IN OUT ANY }

enum TxCategory {
  TRADE SPEND INCOME STAKING LENDING_INCOME MINING AIRDROP AIRDROP_NON_TAXABLE
  GIFT_IN GIFT_OUT DONATION LOST STOLEN DEPOSIT WITHDRAWAL
  COLLATERAL_OUT COLLATERAL_IN BORROWING LOAN_REPAYMENT LIQUIDATION FEE MARGIN
}
```

`SET_INITIAL_STATE`: the current initial value plus `"categoryRules": [], "categoryOverrides": []`.

`ADD_MODULE` `{ id: <new uuid>, name: "categories", description: "Tax categories: counterparty rules and per-transaction overrides." }`, then `ADD_OPERATION` per operation (scope global) with these input schemas:

```graphql
input AddCategoryRuleInput {
  id: OID!
  counterparty: String!
  chainId: Int
  direction: CategoryDirection!
  asset: String
  category: TxCategory!
  label: String
}
input UpdateCategoryRuleInput {
  id: OID!
  category: TxCategory
  direction: CategoryDirection
  label: String
}
input RemoveCategoryRuleInput { id: OID! }
input SetEventCategoriesInput { overrides: [CategoryOverrideInput!]! }
input CategoryOverrideInput {
  wallet: String!
  eventId: String!
  sequenceIndex: Int!
  category: TxCategory!
  giftCost: String
  giftAcquiredAt: DateTime
}
input ClearEventCategoriesInput { events: [EventKeyInput!]! }
input EventKeyInput { wallet: String! eventId: String! sequenceIndex: Int! }
```

Errors (`ADD_OPERATION_ERROR`): ADD_CATEGORY_RULE → `InvalidCounterpartyError` ("counterparty is not an address"); UPDATE_CATEGORY_RULE and REMOVE_CATEGORY_RULE → `CategoryRuleNotFoundError`; SET_EVENT_CATEGORIES → `InvalidGiftBasisError` ("gift cost must be a decimal; gift fields only on GIFT_IN").

`SET_OPERATION_REDUCER` for each with the bodies from Step 4 (copy the function bodies).

- [ ] **Step 3: Wait for codegen, check it**

`getCodegenStatus` `waitSeconds: 60` → `done`. If it fails on `gen/categories`, use the shim command from Global Constraints. Confirm `document-models/portfolio/v1/gen/categories/error.ts` exists and `npm run tsc` passes.

- [ ] **Step 4: Write the reducers** (`src/reducers/categories.ts`, replacing the generated stub)

```ts
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
function lists(state: PortfolioState): { rules: CategoryRule[]; overrides: CategoryOverride[] } {
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
      throw new InvalidCounterpartyError(`${action.input.counterparty} is not an address`);
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
    if (!rule) throw new CategoryRuleNotFoundError(`Rule ${action.input.id} does not exist`);
    if (action.input.category != null) rule.category = action.input.category;
    if (action.input.direction != null) rule.direction = action.input.direction;
    if (action.input.label != null) rule.label = action.input.label.trim() || null;
  },
  removeCategoryRuleOperation(state, action) {
    const { rules } = lists(state);
    const index = rules.findIndex((r) => r.id === action.input.id);
    if (index === -1) throw new CategoryRuleNotFoundError(`Rule ${action.input.id} does not exist`);
    rules.splice(index, 1);
  },
  setEventCategoriesOperation(state, action) {
    const { overrides } = lists(state);
    for (const o of action.input.overrides) {
      const gift = o.giftCost != null || o.giftAcquiredAt != null;
      if (gift && o.category !== "GIFT_IN") {
        throw new InvalidGiftBasisError("Gift cost and date belong on a GIFT_IN override only");
      }
      if (o.giftCost != null && !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(o.giftCost)) {
        throw new InvalidGiftBasisError(`Gift cost ${o.giftCost} is not a decimal`);
      }
    }
    for (const o of action.input.overrides) {
      const next = {
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
};
```

- [ ] **Step 5: Write the tests** (`tests/categories.test.ts`, replacing the generated stub)

```ts
import {
  addCategoryRule,
  clearEventCategories,
  reducer,
  removeCategoryRule,
  setEventCategories,
  updateCategoryRule,
  utils,
} from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const BINANCE = "0x28C6c06298d514Db089934071355E5743bf21d60";
const W = "0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50";
const lastError = (doc: ReturnType<typeof utils.createDocument>) => doc.operations.global.at(-1)?.error;
const withRule = () =>
  reducer(
    utils.createDocument(),
    addCategoryRule({ id: "r1", counterparty: BINANCE, direction: "OUT", category: "WITHDRAWAL", label: " Binance " }),
  );

describe("CategoriesOperations", () => {
  it("adds a rule with a lower-cased counterparty and trimmed label", () => {
    const doc = withRule();
    expect(lastError(doc)).toBeUndefined();
    expect(doc.state.global.categoryRules).toEqual([
      { id: "r1", counterparty: BINANCE.toLowerCase(), chainId: null, direction: "OUT", asset: null, category: "WITHDRAWAL", label: "Binance" },
    ]);
  });

  it("refuses a rule for something that is not an address", () => {
    const doc = reducer(utils.createDocument(), addCategoryRule({ id: "r1", counterparty: "binance", direction: "ANY", category: "DEPOSIT" }));
    expect(lastError(doc)).toBe("binance is not an address");
  });

  it("updates and removes rules, refusing unknown ids", () => {
    let doc = reducer(withRule(), updateCategoryRule({ id: "r1", category: "GIFT_OUT", label: "" }));
    expect(doc.state.global.categoryRules[0]).toMatchObject({ category: "GIFT_OUT", label: null, direction: "OUT" });
    doc = reducer(doc, updateCategoryRule({ id: "nope", category: "TRADE" }));
    expect(lastError(doc)).toBe("Rule nope does not exist");
    doc = reducer(doc, removeCategoryRule({ id: "r1" }));
    expect(doc.state.global.categoryRules).toEqual([]);
    doc = reducer(doc, removeCategoryRule({ id: "r1" }));
    expect(lastError(doc)).toBe("Rule r1 does not exist");
  });

  it("upserts overrides per wallet, event and sequence, and clears them", () => {
    let doc = reducer(
      utils.createDocument(),
      setEventCategories({ overrides: [{ wallet: W.toUpperCase().replace("0X", "0x"), eventId: "e1", sequenceIndex: 0, category: "GIFT_OUT" }] }),
    );
    doc = reducer(
      doc,
      setEventCategories({
        overrides: [{ wallet: W, eventId: "e1", sequenceIndex: 0, category: "GIFT_IN", giftCost: "1234.5", giftAcquiredAt: "2023-01-01T00:00:00.000Z" }],
      }),
    );
    expect(doc.state.global.categoryOverrides).toEqual([
      { wallet: W, eventId: "e1", sequenceIndex: 0, category: "GIFT_IN", giftCost: "1234.5", giftAcquiredAt: "2023-01-01T00:00:00.000Z" },
    ]);
    doc = reducer(doc, clearEventCategories({ events: [{ wallet: W, eventId: "e1", sequenceIndex: 0 }] }));
    expect(doc.state.global.categoryOverrides).toEqual([]);
  });

  it("refuses gift fields off a GIFT_IN override and a cost that is not a decimal", () => {
    const off = reducer(utils.createDocument(), setEventCategories({ overrides: [{ wallet: W, eventId: "e", sequenceIndex: 0, category: "TRADE", giftCost: "1" }] }));
    expect(lastError(off)).toBe("Gift cost and date belong on a GIFT_IN override only");
    const bad = reducer(utils.createDocument(), setEventCategories({ overrides: [{ wallet: W, eventId: "e", sequenceIndex: 0, category: "GIFT_IN", giftCost: "-1" }] }));
    expect(lastError(bad)).toBe("Gift cost -1 is not a decimal");
  });

  it("reads a document from before categories as having none", () => {
    const old = utils.createDocument();
    delete (old.state.global as { categoryRules?: unknown }).categoryRules;
    delete (old.state.global as { categoryOverrides?: unknown }).categoryOverrides;
    const doc = reducer(old, addCategoryRule({ id: "r1", counterparty: BINANCE, direction: "ANY", category: "DEPOSIT" }));
    expect(lastError(doc)).toBeUndefined();
    expect(doc.state.global.categoryOverrides).toEqual([]);
  });
});
```

- [ ] **Step 6: Run** `npx vitest run document-models/portfolio` — Expected: all pass. Then `npm run tsc`, `npm run lint:fix`, `npm run test:coverage` (reducers ≥ 95%).

- [ ] **Step 7: Commit** (immediately, before any further codegen)

```bash
git add document-models/portfolio
git commit -m "feat(portfolio): tax category rules and per-transaction overrides"
```

---

### Task 2: The classifier

**Files:**
- Create: `processors/shared/categories.ts`
- Create: `processors/shared/categories.test.ts`

**Interfaces:**
- Consumes: rule/override shapes from Task 1 (as plain objects; no model import).
- Produces:
  ```ts
  export type TxCategory = "TRADE" | … | "MARGIN" | "UNCLASSIFIED";
  export type CategorySource = "override" | "rule" | "auto" | "unclassified";
  export interface ClassifyEvent { wallet: string; id: string; eventIdentifier: string; sequenceIndex: number; type: string; subtype: string; asset: string; amount: string; counterparty: string | null; chainId?: number }
  export interface ClassifyContext { knownAddresses: ReadonlySet<string>; rules: CategoryRuleLike[]; overrides: Map<string, CategoryOverrideLike> }
  export interface Classified { category: TxCategory; source: CategorySource; giftCost: string | null; giftAcquiredAt: string | null }
  export function txHashOf(eventIdentifier: string): string;
  export function overrideKey(wallet: string, eventId: string, sequenceIndex: number): string;
  export function classify(events: ClassifyEvent[], ctx: ClassifyContext): Map<string, Classified>; // key: overrideKey(...)
  export const DIRECTION: Record<string, "in" | "out" | undefined>;
  ```

- [ ] **Step 1: Write the failing tests** (`processors/shared/categories.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { classify, overrideKey, txHashOf, type ClassifyEvent } from "./categories.js";

const W = "0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50";
const OWN = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const BINANCE = "0x28c6c06298d514db089934071355e5743bf21d60";
const STRANGER = "0x9999999999999999999999999999999999999999";
const TX = `0x${"a".repeat(64)}`;
const ETH = "eip155:1/slip44:60";
const USDT = "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7";

const ev = (over: Partial<ClassifyEvent> & { id: string }): ClassifyEvent => ({
  wallet: W, eventIdentifier: TX, sequenceIndex: 0, type: "SPEND", subtype: "NONE",
  asset: ETH, amount: "1", counterparty: STRANGER, chainId: 1, ...over,
});
const ctx = (over: Partial<Parameters<typeof classify>[1]> = {}) => ({
  knownAddresses: new Set([W, OWN]), rules: [], overrides: new Map(), ...over,
});
const one = (event: ClassifyEvent, c = ctx()) => classify([event], c).get(overrideKey(event.wallet, event.id, event.sequenceIndex));

describe("txHashOf", () => {
  it("strips a decoder's log suffix", () => {
    expect(txHashOf(`${TX}-165`)).toBe(TX);
    expect(txHashOf(TX)).toBe(TX);
    expect(txHashOf("withdrawal-123")).toBe("withdrawal-123");
  });
});

describe("classify", () => {
  it("leaves a transfer to a stranger unclassified", () => {
    expect(one(ev({ id: "e1" }))).toEqual({ category: "UNCLASSIFIED", source: "unclassified", giftCost: null, giftAcquiredAt: null });
  });

  it("books moves between own wallets as withdrawal and deposit", () => {
    expect(one(ev({ id: "e1", counterparty: OWN }))?.category).toBe("WITHDRAWAL");
    expect(one(ev({ id: "e2", type: "RECEIVE", counterparty: OWN }))?.category).toBe("DEPOSIT");
  });

  it("derives protocol categories from the decoder's subtypes", () => {
    const cases: Array<[string, string, string]> = [
      ["SPEND", "DEPOSIT_ASSET", "COLLATERAL_OUT"],
      ["RECEIVE", "REMOVE_ASSET", "COLLATERAL_IN"],
      ["RECEIVE", "WITHDRAWAL", "COLLATERAL_IN"],
      ["RECEIVE", "BORROW", "BORROWING"],
      ["SPEND", "REPAY", "LOAN_REPAYMENT"],
      ["SPEND", "LIQUIDATION", "LIQUIDATION"],
      ["RECEIVE", "YIELD", "LENDING_INCOME"],
      ["RECEIVE", "AIRDROP", "AIRDROP"],
      ["STAKING", "BLOCK_PRODUCTION", "STAKING"],
      ["SPEND", "FEE", "FEE"],
      ["SPEND", "LP_MINT", "COLLATERAL_OUT"],
      ["RECEIVE", "LP_BURN", "COLLATERAL_IN"],
      ["SPEND", "NAME_REGISTRATION", "FEE"],
    ];
    for (const [type, subtype, category] of cases) {
      expect(one(ev({ id: `${type}-${subtype}`, type, subtype, counterparty: "aave-v3" }))?.category, `${type}/${subtype}`).toBe(category);
    }
  });

  it("books a beacon withdrawal as staking, and a 16 ETH one as the stake returning", () => {
    const skim = ev({ id: "w1", eventIdentifier: "withdrawal-1", type: "STAKING", subtype: "WITHDRAWAL", counterparty: W, amount: "12000000000000000" });
    expect(one(skim)?.category).toBe("STAKING");
    expect(one({ ...skim, id: "w2", amount: "32000000000000000000" })?.category).toBe("COLLATERAL_IN");
  });

  it("calls a transaction trade when one wallet sends one asset and receives another", () => {
    const out = ev({ id: "o", eventIdentifier: TX, sequenceIndex: 3, asset: USDT, counterparty: "uniswap-v2" });
    const inn = ev({ id: "i", eventIdentifier: `${TX}-9`, sequenceIndex: 9, type: "RECEIVE", asset: ETH, counterparty: STRANGER });
    const result = classify([out, inn], ctx());
    expect(result.get(overrideKey(W, "o", 3))?.category).toBe("TRADE");
    expect(result.get(overrideKey(W, "i", 9))?.category).toBe("TRADE");
  });

  it("applies the most specific matching rule, newest first among equals", () => {
    const rules = [
      { id: "r1", counterparty: BINANCE, chainId: null, direction: "ANY", asset: null, category: "GIFT_OUT", label: null },
      { id: "r2", counterparty: BINANCE, chainId: 1, direction: "OUT", asset: null, category: "WITHDRAWAL", label: null },
      { id: "r3", counterparty: BINANCE, chainId: null, direction: "IN", asset: null, category: "DEPOSIT", label: null },
    ];
    const out = one(ev({ id: "e1", counterparty: BINANCE.toUpperCase().replace("0X", "0x") }), ctx({ rules }));
    expect(out).toMatchObject({ category: "WITHDRAWAL", source: "rule" });
    expect(one(ev({ id: "e2", type: "RECEIVE", counterparty: BINANCE }), ctx({ rules }))?.category).toBe("DEPOSIT");
  });

  it("lets an override win over a rule and an automatic default, carrying gift basis", () => {
    const overrides = new Map([[overrideKey(W, "e1", 0), { category: "GIFT_IN", giftCost: "100", giftAcquiredAt: "2022-01-01T00:00:00.000Z" }]]);
    const rules = [{ id: "r", counterparty: OWN, chainId: null, direction: "ANY", asset: null, category: "TRADE", label: null }];
    expect(one(ev({ id: "e1", type: "RECEIVE", counterparty: OWN }), ctx({ rules, overrides }))).toEqual({
      category: "GIFT_IN", source: "override", giftCost: "100", giftAcquiredAt: "2022-01-01T00:00:00.000Z",
    });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run processors/shared/categories.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`processors/shared/categories.ts`)

```ts
/**
 * Tax categories (CoinTracking's list) for ledger events. One function for
 * the books, the subgraph and the editor: an override wins, then the most
 * specific counterparty rule, then a default derived from what the scan and
 * the decoder know, else UNCLASSIFIED. Rows are grouped by transaction hash -
 * a decoded leg is "<hash>-<log>", a generic row "<hash>".
 */
export type TxCategory =
  | "TRADE" | "SPEND" | "INCOME" | "STAKING" | "LENDING_INCOME" | "MINING"
  | "AIRDROP" | "AIRDROP_NON_TAXABLE" | "GIFT_IN" | "GIFT_OUT" | "DONATION"
  | "LOST" | "STOLEN" | "DEPOSIT" | "WITHDRAWAL" | "COLLATERAL_OUT"
  | "COLLATERAL_IN" | "BORROWING" | "LOAN_REPAYMENT" | "LIQUIDATION" | "FEE"
  | "MARGIN" | "UNCLASSIFIED";
export type CategorySource = "override" | "rule" | "auto" | "unclassified";

export interface ClassifyEvent {
  wallet: string;
  id: string;
  eventIdentifier: string;
  sequenceIndex: number;
  type: string;
  subtype: string;
  asset: string;
  amount: string;
  counterparty: string | null;
  chainId?: number;
}
export interface CategoryRuleLike {
  id: string;
  counterparty: string;
  chainId: number | null;
  direction: string;
  asset: string | null;
  category: string;
  label: string | null;
}
export interface CategoryOverrideLike {
  category: string;
  giftCost: string | null;
  giftAcquiredAt: string | null;
}
export interface ClassifyContext {
  knownAddresses: ReadonlySet<string>;
  rules: CategoryRuleLike[];
  /** overrideKey(wallet, eventId, sequenceIndex) -> override. */
  overrides: Map<string, CategoryOverrideLike>;
}
export interface Classified {
  category: TxCategory;
  source: CategorySource;
  giftCost: string | null;
  giftAcquiredAt: string | null;
}

/** Which way a row moves value: SPEND leaves, RECEIVE and STAKING arrive. */
export const DIRECTION: Record<string, "in" | "out" | undefined> = {
  RECEIVE: "in",
  STAKING: "in",
  SPEND: "out",
};

/** A beacon withdrawal this large is the stake: below 16 ETH a validator is ejected. */
const EXIT_WEI = 16_000_000_000_000_000_000n;

export const txHashOf = (eventIdentifier: string): string => {
  const match = /^(0x[0-9a-fA-F]{64})-\d+$/.exec(eventIdentifier);
  return (match ? match[1] : eventIdentifier).toLowerCase();
};

export const overrideKey = (wallet: string, eventId: string, sequenceIndex: number): string =>
  `${wallet.toLowerCase()}|${eventId}|${sequenceIndex}`;

const SUBTYPE_DEFAULT: Record<string, TxCategory> = {
  DEPOSIT_ASSET: "COLLATERAL_OUT",
  REMOVE_ASSET: "COLLATERAL_IN",
  BORROW: "BORROWING",
  REPAY: "LOAN_REPAYMENT",
  LIQUIDATION: "LIQUIDATION",
  YIELD: "LENDING_INCOME",
  AIRDROP: "AIRDROP",
  BLOCK_PRODUCTION: "STAKING",
  FEE: "FEE",
  LP_MINT: "COLLATERAL_OUT",
  LP_BURN: "COLLATERAL_IN",
  NAME_REGISTRATION: "FEE",
};

function ruleFor(event: ClassifyEvent, direction: "in" | "out", rules: CategoryRuleLike[]): CategoryRuleLike | undefined {
  const counterparty = event.counterparty?.toLowerCase();
  if (!counterparty) return undefined;
  const matching = rules.filter(
    (r) =>
      r.counterparty === counterparty &&
      (r.chainId === null || r.chainId === event.chainId) &&
      (r.direction === "ANY" || r.direction.toLowerCase() === direction) &&
      (r.asset === null || r.asset === event.asset),
  );
  const specificity = (r: CategoryRuleLike) =>
    (r.chainId !== null ? 1 : 0) + (r.direction !== "ANY" ? 1 : 0) + (r.asset !== null ? 1 : 0);
  // Most specific first; among equals the newest (later in the list).
  return matching
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => specificity(b.rule) - specificity(a.rule) || b.index - a.index)[0]?.rule;
}

function derived(event: ClassifyEvent, direction: "in" | "out", ctx: ClassifyContext, trade: boolean): TxCategory {
  const fromSelf = event.counterparty?.toLowerCase() === event.wallet.toLowerCase();
  if (event.type === "STAKING" && event.subtype === "WITHDRAWAL") {
    if (!fromSelf) return "COLLATERAL_IN"; // principal back out of a staking contract
    return BigInt(event.amount) >= EXIT_WEI ? "COLLATERAL_IN" : "STAKING";
  }
  if (event.subtype === "WITHDRAWAL" && direction === "in") return "COLLATERAL_IN";
  const bySubtype = SUBTYPE_DEFAULT[event.subtype];
  if (bySubtype) return bySubtype;
  if (event.type === "STAKING") return "STAKING";
  if (event.type === "TRADE" || trade) return "TRADE";
  if (event.counterparty && !fromSelf && ctx.knownAddresses.has(event.counterparty.toLowerCase())) {
    return direction === "out" ? "WITHDRAWAL" : "DEPOSIT";
  }
  return "UNCLASSIFIED";
}

export function classify(events: ClassifyEvent[], ctx: ClassifyContext): Map<string, Classified> {
  // Per (transaction, wallet): which assets went out and came in, for trades.
  const flows = new Map<string, { out: Set<string>; in: Set<string> }>();
  for (const event of events) {
    const direction = DIRECTION[event.type];
    if (!direction || event.subtype === "FEE") continue;
    const key = `${txHashOf(event.eventIdentifier)}|${event.wallet.toLowerCase()}`;
    const flow = flows.get(key) ?? { out: new Set<string>(), in: new Set<string>() };
    flow[direction].add(event.asset);
    flows.set(key, flow);
  }
  const result = new Map<string, Classified>();
  for (const event of events) {
    const key = overrideKey(event.wallet, event.id, event.sequenceIndex);
    const override = ctx.overrides.get(key);
    if (override) {
      result.set(key, {
        category: override.category as TxCategory,
        source: "override",
        giftCost: override.giftCost,
        giftAcquiredAt: override.giftAcquiredAt,
      });
      continue;
    }
    const direction = DIRECTION[event.type] ?? "in";
    const rule = ruleFor(event, direction, ctx.rules);
    if (rule) {
      result.set(key, { category: rule.category as TxCategory, source: "rule", giftCost: null, giftAcquiredAt: null });
      continue;
    }
    const flow = flows.get(`${txHashOf(event.eventIdentifier)}|${event.wallet.toLowerCase()}`);
    const trade =
      flow !== undefined &&
      flow.out.size > 0 &&
      flow.in.size > 0 &&
      [...flow.in].some((asset) => !flow.out.has(asset));
    const category = derived(event, direction, ctx, trade);
    result.set(key, {
      category,
      source: category === "UNCLASSIFIED" ? "unclassified" : "auto",
      giftCost: null,
      giftAcquiredAt: null,
    });
  }
  return result;
}
```

- [ ] **Step 4: Run** `npx vitest run processors/shared/categories.test.ts` — Expected: PASS. Then `npm run tsc`.

- [ ] **Step 5: Commit**

```bash
git add processors/shared/categories.ts processors/shared/categories.test.ts
git commit -m "feat(accounting): classify ledger events into tax categories"
```

---

### Task 3: The fold books by category

**Files:**
- Modify: `processors/accounting-index/fold.ts` (types, `openLot`, `consumeFcfs`, `foldGroup`, `foldAll`, `serializeFold`/`deserializeFold`)
- Modify: `processors/accounting-index/fold.test.ts`

**Interfaces:**
- Consumes: `classify`, `overrideKey`, `DIRECTION`, `CategoryRuleLike`, `CategoryOverrideLike` from Task 2.
- Produces:
  - `FoldContext` gains `rules: CategoryRuleLike[]` and `overrides: Map<string, CategoryOverrideLike>` (both default empty in callers).
  - `Lot` gains `acquiredAt: string`; `ConsumedLeg` gains `acquiredAt: string`.
  - `FoldState` gains `departures: Departure[]` with `interface Departure { wallet; asset; timestamp; category: "GIFT_OUT" | "DONATION" | "LOST" | "STOLEN" | "LOAN_REPAYMENT"; quantity: string; cost: string; eventId: string }`, and `categories: Map<string, Classified>` (key `overrideKey`).
  - Income buckets are the category name (STAKING, LENDING_INCOME, MINING, AIRDROP, INCOME).

Treatment (spec section 1), by direction:

| out (SPEND legs) | in (RECEIVE/STAKING legs) |
|---|---|
| TRADE, SPEND, LIQUIDATION: consume FIFO, realize proceeds − cost (value gap if unpriced) | TRADE, SPEND, LIQUIDATION: lot at market value |
| GIFT_OUT, DONATION, LOST, STOLEN, LOAN_REPAYMENT: consume FIFO, push a `Departure`, no PnL | INCOME, STAKING, LENDING_INCOME, MINING, AIRDROP: income bucket + lot at market |
| WITHDRAWAL, DEPOSIT: carry basis (today's self-transfer path) | AIRDROP_NON_TAXABLE: lot at cost 0 |
| FEE: today's fee path (expense) | GIFT_IN: lot at `giftCost` (scaled 1e8) acquired `giftAcquiredAt`; without a cost: lot at 0 and a "basis" gap |
| COLLATERAL_OUT, COLLATERAL_IN, MARGIN: no-op | DEPOSIT, WITHDRAWAL: pair carried basis (today's path) |
| UNCLASSIFIED: no-op (not booked) | BORROWING: lot at market value, no income |
| | COLLATERAL_IN, COLLATERAL_OUT, MARGIN, UNCLASSIFIED: no-op |

- [ ] **Step 1: Write failing tests** (append to `fold.test.ts`; the file's `event`, `ctx`, `lotsTotal`, `month`, `W1`, `W2`, `ETH`, `USDC` helpers exist). First change the shared `ctx` constant to include `rules: [], overrides: new Map()`.

```ts
describe("books by tax category", () => {
  const STRANGER = "0x9999999999999999999999999999999999999999";
  const withOverride = (key: [string, string, number], category: string, gift: Partial<{ giftCost: string; giftAcquiredAt: string }> = {}) => ({
    ...ctx,
    overrides: new Map([[`${key[0]}|${key[1]}|${key[2]}`, { category, giftCost: gift.giftCost ?? null, giftAcquiredAt: gift.giftAcquiredAt ?? null }]]),
  });
  const buy = event({ id: "buy", amount: "2000000000000000000", type: "RECEIVE", counterparty: "uniswap-v2" });
  const buyCtx = (extra: ReturnType<typeof withOverride>) => ({
    ...extra,
    overrides: new Map([...extra.overrides, [`${W1}|buy|0`, { category: "TRADE", giftCost: null, giftAcquiredAt: null }]]),
  });

  it("does not book an unclassified transfer to a stranger", () => {
    const state = foldAll([event({ id: "x", type: "SPEND", counterparty: STRANGER })], ctx);
    expect(state.realized).toEqual([]);
    expect(state.unpricedLegs).toEqual([]);
    expect(state.categories.get(`${W1}|x|0`)?.category).toBe("UNCLASSIFIED");
  });

  it("realizes a sale and stamps each consumed leg with its acquisition date", () => {
    const sell = event({ id: "sell", type: "SPEND", counterparty: STRANGER, amount: "1000000000000000000", timestamp: "2026-03-01T00:00:00.000Z" });
    const state = foldAll([buy, sell], buyCtx(withOverride([W1, "sell", 0], "TRADE")));
    expect(state.realized).toHaveLength(1);
    expect(state.realized[0].consumed[0].acquiredAt).toBe("2026-01-15T10:00:00.000Z");
  });

  it("lets a gift out leave the books with no gain, as a departure", () => {
    const gift = event({ id: "g", type: "SPEND", counterparty: STRANGER, amount: "1000000000000000000" });
    const state = foldAll([buy, gift], buyCtx(withOverride([W1, "g", 0], "GIFT_OUT")));
    expect(state.realized).toEqual([]);
    expect(state.departures).toEqual([
      expect.objectContaining({ category: "GIFT_OUT", quantity: "1000000000000000000", cost: "200000000000" }),
    ]);
    expect(lotsTotal(state, W1, ETH)).toBe(1000000000000000000n);
  });

  it("takes over a received gift's cost and date", () => {
    const gift = event({ id: "g", type: "RECEIVE", counterparty: STRANGER, amount: "1000000000000000000" });
    const state = foldAll([gift], withOverride([W1, "g", 0], "GIFT_IN", { giftCost: "1500", giftAcquiredAt: "2021-05-01T00:00:00.000Z" }));
    const lot = state.lots.get(`${W1}|${ETH}`)?.[0];
    expect(lot).toMatchObject({ cost: 150000000000n, acquiredAt: "2021-05-01T00:00:00.000Z" });
    expect(state.income.size).toBe(0);
  });

  it("counts a gift in without the giver's cost as a basis gap at cost 0", () => {
    const gift = event({ id: "g", type: "RECEIVE", counterparty: STRANGER });
    const state = foldAll([gift], withOverride([W1, "g", 0], "GIFT_IN"));
    expect(state.lots.get(`${W1}|${ETH}`)?.[0].cost).toBe(0n);
    expect(state.unpricedLegs.map((l) => l.reason)).toEqual(["basis"]);
  });

  it("books a liquidation as a sale of the collateral", () => {
    const seized = event({ id: "liq", type: "SPEND", subtype: "LIQUIDATION", counterparty: "aave-v3", amount: "1000000000000000000", valuation: { unit: "EUR", price: "1500", source: "COINGECKO" } });
    const state = foldAll([buy, seized], buyCtx({ ...ctx, overrides: new Map() }));
    expect(state.realized).toHaveLength(1);
    expect(state.realized[0].pnl).toBe("-50000000000"); // 1500 - 2000
  });

  it("opens a borrowed lot at market without income, and repays at cost without gain", () => {
    const borrow = event({ id: "b", type: "RECEIVE", subtype: "BORROW", asset: USDC, amount: "1000000000", counterparty: "aave-v3", valuation: { unit: "EUR", price: "0.9", source: "COINGECKO" } });
    const repay = event({ id: "r", type: "SPEND", subtype: "REPAY", asset: USDC, amount: "1000000000", counterparty: "aave-v3", timestamp: "2026-02-01T00:00:00.000Z", valuation: { unit: "EUR", price: "0.95", source: "COINGECKO" } });
    const state = foldAll([borrow, repay], ctx);
    expect(state.income.size).toBe(0);
    expect(state.realized).toEqual([]);
    expect(state.departures).toEqual([expect.objectContaining({ category: "LOAN_REPAYMENT", cost: "90000000000" })]);
    expect(state.lots.get(`${W1}|${USDC}`)).toBeUndefined();
  });

  it("books non-taxable airdrops at cost 0 and taxable ones as income", () => {
    const a = event({ id: "a", type: "RECEIVE", subtype: "AIRDROP", counterparty: STRANGER });
    expect(foldAll([a], ctx).income.get(`${W1}|AIRDROP|2026-01`)).toBe(200000000000n);
    const n = foldAll([a], withOverride([W1, "a", 0], "AIRDROP_NON_TAXABLE"));
    expect(n.income.size).toBe(0);
    expect(n.lots.get(`${W1}|${ETH}`)?.[0].cost).toBe(0n);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run processors/accounting-index/fold.test.ts` — Expected: the new tests FAIL (`state.categories` / `departures` undefined).

- [ ] **Step 3: Implement in `fold.ts`**

1. Imports and types:

```ts
import {
  classify,
  DIRECTION,
  overrideKey,
  type CategoryOverrideLike,
  type CategoryRuleLike,
  type Classified,
} from "../shared/categories.js";
```

Add to `FoldContext`: `rules: CategoryRuleLike[]; overrides: Map<string, CategoryOverrideLike>;`. Add `acquiredAt: string` to `Lot` and `ConsumedLeg`. Add:

```ts
export interface Departure {
  wallet: string;
  asset: string;
  timestamp: string;
  category: "GIFT_OUT" | "DONATION" | "LOST" | "STOLEN" | "LOAN_REPAYMENT";
  quantity: string;
  cost: string;
  eventId: string;
}
```

and `departures: Departure[]; categories: Map<string, Classified>;` on `FoldState` (initialised `[]` / `new Map()` in `emptyFoldState`).

2. `openLot(state, event, quantity, cost, acquiredAt = event.timestamp)` stores `acquiredAt`; `consumeFcfs` copies `lot.acquiredAt` into each `ConsumedLeg`, and the partial-lot remainder keeps it.

3. Replace `NOISE_SUBTYPES`, `INCOME_SUBTYPES`, `SIGNED` and `EXIT_WEI` with category sets:

```ts
const DISPOSALS = new Set(["TRADE", "SPEND", "LIQUIDATION"]);
const DEPARTURES = new Set(["GIFT_OUT", "DONATION", "LOST", "STOLEN", "LOAN_REPAYMENT"]);
const INCOME = new Set(["INCOME", "STAKING", "LENDING_INCOME", "MINING", "AIRDROP"]);
const MOVES = new Set(["DEPOSIT", "WITHDRAWAL"]);
```

4. `foldAll` classifies once, then folds groups:

```ts
export function foldAll(events: FoldEvent[], ctx: FoldContext): FoldState {
  const state = emptyFoldState();
  state.categories = classify(
    events.filter((e) => !e.ignored).map((e) => ({ ...e, chainId: Number(/^eip155:(\d+)\//.exec(e.asset)?.[1] ?? 1) })),
    { knownAddresses: ctx.knownAddresses, rules: ctx.rules, overrides: ctx.overrides },
  );
  for (const group of groupEvents(events)) foldGroup(state, group, ctx);
  return state;
}
```

5. `foldGroup`: compute `const category = (e: FoldEvent) => state.categories.get(overrideKey(e.wallet, e.id, e.sequenceIndex))` and split legs with `DIRECTION[e.type]`. Out legs:

```ts
for (const event of spends) {
  const cat = category(event);
  const kind = cat?.category ?? "UNCLASSIFIED";
  if (kind === "FEE") { /* today's fee path: consumeFcfs + expense / value gap */ }
  else if (MOVES.has(kind)) { /* today's selfTransfer path: consumeFcfs, push Carry */ }
  else if (DISPOSALS.has(kind)) { /* today's disposal path: consumeFcfs, basis gap, realize or value gap */ }
  else if (DEPARTURES.has(kind)) {
    const basis = consumeFcfs(state, event.wallet, event.asset, BigInt(event.amount));
    if (basis.consumed < BigInt(event.amount)) gap(state, agg, event, "basis");
    state.departures.push({
      wallet: event.wallet, asset: event.asset, timestamp: event.timestamp,
      category: kind as Departure["category"], quantity: basis.consumed.toString(),
      cost: basis.cost.toString(), eventId: event.id,
    });
  }
  // COLLATERAL_*, MARGIN, UNCLASSIFIED: not booked.
}
```

In legs:

```ts
for (const event of receives) {
  const cat = category(event);
  const kind = cat?.category ?? "UNCLASSIFIED";
  const quantity = BigInt(event.amount);
  const agg = monthAgg(state, event.wallet, monthOf(event.timestamp));
  if (MOVES.has(kind)) { /* today's carried-basis pairing path */ continue; }
  if (kind === "AIRDROP_NON_TAXABLE") { openLot(state, event, quantity, 0n); continue; }
  if (kind === "GIFT_IN") {
    const cost = cat?.giftCost != null ? parsePrice(cat.giftCost) : null;
    if (cost === null) gap(state, agg, event, "basis");
    openLot(state, event, quantity, cost ?? 0n, cat?.giftAcquiredAt ?? event.timestamp);
    continue;
  }
  if (!(DISPOSALS.has(kind) || INCOME.has(kind) || kind === "BORROWING")) continue;
  const priced = legValue(event, ctx);
  if (!priced) { gap(state, agg, event, "value"); continue; }
  if (INCOME.has(kind)) {
    const key = `${event.wallet}|${kind}|${monthOf(event.timestamp)}`;
    state.income.set(key, (state.income.get(key) ?? 0n) + priced.value);
    agg.income += priced.value;
  }
  openLot(state, event, quantity, priced.value);
}
```

Keep the "unpaired carry re-opens on the sending wallet" loop, passing the carried lot's original `acquiredAt` (store `acquiredAt` on `Carry` from the first consumed leg).

6. `serializeFold`/`deserializeFold`: include `acquiredAt` on lots, `departures` (as-is) and `categories` (as `[key, value][]`); `deserializeFold` defaults `departures` to `[]`, `categories` to an empty map and a lot's `acquiredAt` to `""` for older checkpoints.

7. Update existing fold tests that relied on the removed sets where their expectations change: rows with a stranger counterparty and subtype NONE are now UNCLASSIFIED — give those tests an override to `TRADE` (as `buyCtx` does) rather than changing assertions.

- [ ] **Step 4: Run** `npx vitest run processors/accounting-index` — Expected: PASS. `npm run tsc`.

- [ ] **Step 5: Commit**

```bash
git add processors/accounting-index/fold.ts processors/accounting-index/fold.test.ts
git commit -m "feat(accounting): book each ledger event by its tax category"
```

---

### Task 4: Accounting index stages categories and persists them

**Files:**
- Modify: `processors/accounting-index/migrations.ts`, `schema.ts`, `stage.ts`, `processor.ts`
- Modify: `processors/accounting-index/processor.test.ts`

**Interfaces:**
- Consumes: `FoldContext.rules/overrides`, `FoldState.categories`, `Lot.acquiredAt` (Task 3).
- Produces: tables `acc_category_rules`, `acc_category_overrides`, `acc_event_categories (wallet, event_id, sequence_index, category, source)`; `lots.acquired_at`; FOLD_VERSION 5.

- [ ] **Step 1: Failing test** (append to `processor.test.ts`)

```ts
it("books by the portfolio's category rules and overrides, and records each event's category", async () => {
  const { db, processor } = await harness();
  await indexAll(processor, walletDocument());
  const before = await db.selectFrom("acc_event_categories").selectAll().execute();
  expect(before.length).toBeGreaterThan(0);

  const tagged = portfolioReducer(
    portfolioDocument(),
    portfolioActions.setEventCategories({ overrides: [{ wallet: W1, eventId: "ev-2", sequenceIndex: 0, category: "GIFT_OUT" }] }),
  );
  await processor.onOperations(replay(tagged));
  const row = await db.selectFrom("acc_event_categories").selectAll()
    .where("event_id", "=", "ev-2").executeTakeFirstOrThrow();
  expect(row).toMatchObject({ category: "GIFT_OUT", source: "override" });
  // A gift realizes nothing.
  const realized = await db.selectFrom("realized").selectAll().execute();
  expect(realized.some((r) => r.source_event_id === "ev-2")).toBe(false);
});
```

- [ ] **Step 2: Run** `npx vitest run processors/accounting-index/processor.test.ts` — Expected: FAIL (no such table).

- [ ] **Step 3: Implement**

`migrations.ts` — new tables (same style as `acc_ignored_assets`), plus `lots.acquired_at`:

```ts
await db.schema.createTable("acc_category_rules")
  .addColumn("document_id", "varchar(255)", (c) => c.notNull())
  .addColumn("id", "varchar(255)", (c) => c.notNull())
  .addColumn("position", "integer", (c) => c.notNull())
  .addColumn("rule", "text", (c) => c.notNull())
  .addPrimaryKeyConstraint("acc_category_rules_pk", ["document_id", "id"])
  .ifNotExists().execute();
await db.schema.createTable("acc_category_overrides")
  .addColumn("document_id", "varchar(255)", (c) => c.notNull())
  .addColumn("key", "text", (c) => c.notNull())
  .addColumn("override", "text", (c) => c.notNull())
  .addPrimaryKeyConstraint("acc_category_overrides_pk", ["document_id", "key"])
  .ifNotExists().execute();
await db.schema.createTable("acc_event_categories")
  .addColumn("wallet", "varchar(128)", (c) => c.notNull())
  .addColumn("event_id", "text", (c) => c.notNull())
  .addColumn("sequence_index", "integer", (c) => c.notNull())
  .addColumn("category", "varchar(32)", (c) => c.notNull())
  .addColumn("source", "varchar(16)", (c) => c.notNull())
  .addPrimaryKeyConstraint("acc_event_categories_pk", ["wallet", "event_id", "sequence_index"])
  .ifNotExists().execute();
const lotColumns = (await db.introspection.getTables()).find((t) => t.name === "lots")?.columns;
if (lotColumns && !lotColumns.some((c) => c.name === "acquired_at")) {
  await db.schema.alterTable("lots").addColumn("acquired_at", "varchar(64)").execute();
}
```

Add the three tables to `down`'s drop list (before `acc_ignored_assets`) and `acquired_at` to the `lots` create (`varchar(64)`). Add the matching row interfaces to `schema.ts` and to `DB`.

`stage.ts`:

```ts
export function portfolioCategoryRows(documentId: string, state: unknown): {
  rules: { document_id: string; id: string; position: number; rule: string }[];
  overrides: { document_id: string; key: string; override: string }[];
} {
  const global = asRecord(unwrapState(state));
  const rules = (global && Array.isArray(global.categoryRules) ? global.categoryRules : [])
    .map((r) => asRecord(r)).filter((r): r is Record<string, unknown> => r !== null && typeof r.id === "string")
    .map((r, position) => ({ document_id: documentId, id: r.id as string, position, rule: JSON.stringify(r) }));
  const overrides = (global && Array.isArray(global.categoryOverrides) ? global.categoryOverrides : [])
    .map((o) => asRecord(o)).filter((o): o is Record<string, unknown> => o !== null && typeof o.wallet === "string" && typeof o.eventId === "string")
    .map((o) => ({
      document_id: documentId,
      key: `${(o.wallet as string).toLowerCase()}|${o.eventId as string}|${Number(o.sequenceIndex)}`,
      override: JSON.stringify({ category: o.category, giftCost: o.giftCost ?? null, giftAcquiredAt: o.giftAcquiredAt ?? null }),
    }));
  return { rules, overrides };
}
```

`foldInputHash` gains a fifth parameter `categories: string = ""` appended to the context only when non-empty (same pattern as ignored assets).

`processor.ts`:
- `FOLD_VERSION = 5` with comment `// 5: books by tax category; lots carry their acquisition date.`
- In the portfolio branch, after `writeIgnoredAssets`: `await this.writeCategories(documentId, portfolioCategoryRows(documentId, parsed))` — delete the document's rows in both tables and insert the new ones in BATCH chunks (wholesale replace; lists are small).
- In `recomputeFold`: read both tables, build `rules` (sorted by `position`, parsed) and `overrides` (Map of key → parsed), pass a stable `categories` string (`JSON.stringify([rules, [...overrides].sort()])`) to `foldInputHash`, and `rules`/`overrides` into the `FoldContext`.
- In `writeFoldTables`: add `"acc_event_categories"` to the cleared tables; insert `state.categories` rows (`key.split("|")` → wallet, event_id, sequence_index); write `acquired_at: lot.acquiredAt` on lots.

- [ ] **Step 4: Run** `npx vitest run processors/accounting-index subgraphs` — Expected: PASS. Then `npm run tsc`, `npm run test:coverage`.

- [ ] **Step 5: Commit**

```bash
git add processors/accounting-index
git commit -m "feat(accounting): stage category rules and overrides, record each event's category"
```

---

### Task 5: Subgraph exposes categories

**Files:**
- Modify: `subgraphs/portfolio-api/schema.ts`, `resolvers.ts`, `lib.ts`
- Modify: `subgraphs/portfolio-api/resolvers.test.ts`, `editors/stackfolio/lib/graphql.ts` (`EventRow`, `EVENTS_ROWS`, `EventsFilter`), `editors/stackfolio/lib/graphql.schema.test.ts` stays green

**Interfaces:**
- Consumes: `acc_event_categories` (Task 4).
- Produces: `PortfolioApiEvent.category: String`, `categorySource: String`; `events(categories: [String!])` filter.

- [ ] **Step 1: Failing test** (append to `resolvers.test.ts`)

```ts
it("hands each event its category and filters by it", async () => {
  const { q } = await harness();
  const page = (await q.events()) as { rows: { eventId: string; category: string | null; categorySource: string | null }[] };
  expect(page.rows.every((r) => typeof r.category === "string")).toBe(true);
  const unclassified = (await q.events({ categories: ["UNCLASSIFIED"] })) as { rows: { categorySource: string }[] };
  expect(unclassified.rows.every((r) => r.categorySource === "unclassified")).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run subgraphs/portfolio-api/resolvers.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**
- `schema.ts`: on `PortfolioApiEvent` add `"Tax category (CoinTracking's list) or UNCLASSIFIED." category: String` and `"override, rule, auto or unclassified." categorySource: String`; on `events(...)` add `"Only these tax categories." categories: [String!]`.
- `lib.ts`: `export function attachCategories<T extends { address: string; eventId: string; sequenceIndex: number }>(rows: T[], categories: { wallet: string; event_id: string; sequence_index: number; category: string; source: string }[]): (T & { category: string | null; categorySource: string | null })[]` — map by `${wallet.toLowerCase()}|${event_id}|${sequence_index}`.
- `resolvers.ts` `events`: when `args.categories?.length`, first read matching `(wallet, event_id, sequence_index)` from `acc_event_categories` (`where category in args.categories`) and restrict the page with `where event_id in …` (as `needsPrice` does); after loading the page, read the page's categories and `attachCategories`.
- `editors/stackfolio/lib/graphql.ts`: add `category: string | null; categorySource: string | null` to `EventRow`, the two fields to `EVENTS_ROWS`, `categories?: string[]` to `EventsFilter` and `$categories: [String!]` to the events query.

- [ ] **Step 4: Run** `npx vitest run subgraphs editors` — Expected: PASS (including `graphql.schema.test.ts`). `npm run tsc`.

- [ ] **Step 5: Commit**

```bash
git add subgraphs/portfolio-api editors/stackfolio/lib/graphql.ts
git commit -m "feat(portfolio-api): events carry their tax category and filter by it"
```

---

### Task 6: Live verification and PR

- [ ] **Step 1:** `npm run tsc && npm run lint:fix && npm run test:coverage`; `npm run build`; `restartVetra`.
- [ ] **Step 2:** Wait for the accounting index to refold (FOLD_VERSION 5 applies on start). Then query `events(driveId, categories: ["UNCLASSIFIED"], ignored: false)` and the category spread for frankp.eth. Expected: Aave rows as COLLATERAL_*/BORROWING/LOAN_REPAYMENT, Uniswap rows as TRADE, beacon withdrawals as STAKING, transfers between own wallets as DEPOSIT/WITHDRAWAL; the remaining UNCLASSIFIED rows are transfers to/from strangers.
- [ ] **Step 3:** Check P&L still loads and income still shows STAKING ≈ €28k.
- [ ] **Step 4:** Push `feat/tax-categories`, open a PR summarising part 1 with the live category spread, merge.
