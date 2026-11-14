# Tax categories part 2: spam, airdrops and the review queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spam tokens drop out of the books and the queue automatically, known airdrop claims book as non-taxable airdrops, and the History page gets a "Needs a type" queue that classifies the rest by counterparty in a few clicks.

**Architecture:** The shared classifier (`processors/shared/categories.ts`) gains two automatic outcomes: `SPAM` (asset no portfolio wallet ever moved in a transaction it paid gas for, and that has no price, and is not trusted) and `AIRDROP_NON_TAXABLE` for receipts from a known claim contract (`processors/shared/airdrops.ts`). The accounting index stages the portfolio's new `trustedAssets` list, passes priced/trusted sets into classification and re-folds (FOLD_VERSION 6). A new subgraph query `classificationQueue` groups UNCLASSIFIED legs by counterparty and direction with EUR value and a "suspected airdrop" flag; the editor renders it as a History sub-tab with per-group rule / override / spam actions, a category control in the event detail, category badges and filter, and an "unclassified" notice on Dashboard and P&L.

**Tech Stack:** TypeScript, Powerhouse document models (reactor-mcp + `src/reducers`), Kysely relational processor, GraphQL subgraph, React + Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-tax-categories-design.md` (sections 2a and 3).

## Global Constraints

- Work on branch `feat/review-queue`; one logical change per commit; no Claude attribution in commits or PRs; `git add` explicit paths only (the user's `powerhouse.config.json` change stays uncommitted).
- Never edit `gen/` or `.ph/`; model changes go through reactor-mcp **and** `document-models/portfolio/v1/src/reducers/`.
- Never start a second reactor; pieces load from `dist/` (`npm run build`, then `restartVetra`).
- Codegen workaround (from the repo root): `NODE_OPTIONS="--require /tmp/claude-1000/-home-froid-projects-stackfolio/57d02fa9-1c7c-4aee-95ad-7be3d1154687/scratchpad/tolerate-missing-dir.cjs" pnpm exec ph-cli generate document-model --dir portfolio`; revert its formatting-only churn on existing reducers/tests with `git checkout`.
- After every task: `npm run tsc`, `npm run lint:fix`; after reducer changes `npm run test:coverage` (reducers ≥ 95%).
- "Signed" = the wallet paid gas: the transaction carries that wallet's `FEE` row.
- Spam is only ever an ERC-20 (`/erc20:` in the asset id); native assets are never spam.
- Default airdrop treatment: `AIRDROP_NON_TAXABLE` (user decision 2026-11-14).

---

### Task 1: Portfolio model — `trustedAssets` and SET_ASSET_TRUSTED

**Files:**
- Modify (via reactor-mcp): portfolio document model `OrBx7YuzcS1H5Lu3rJXPdp913DSFct9rkODYgt-3lMg`, module `mod-categories`
- Modify: `document-models/portfolio/v1/src/reducers/categories.ts`
- Test: `document-models/portfolio/v1/tests/categories.test.ts`

**Interfaces:**
- Produces: state `trustedAssets: [String!]!`; action creator `setAssetTrusted({ asset: string, trusted: boolean })` exported from `document-models/portfolio/v1`.

- [ ] **Step 1: Change the model through MCP.** `getDocumentModelSchema` (compact) for the portfolio type, then one `addActions` batch:
  - `SET_STATE_SCHEMA`: add `trustedAssets: [String!]!` to `PortfolioState` (after `ignoredAssets`) and `"trustedAssets": []` to the initial state.
  - `ADD_OPERATION` in `mod-categories`: `SET_ASSET_TRUSTED`, input `input SetAssetTrustedInput { asset: String! trusted: Boolean! }`, reducer text equal to the Step 3 body.
  Then `getCodegenStatus` (`waitSeconds: 60`); if codegen fails on "Directory not found", run the codegen workaround; `git checkout` reformatted existing files.

- [ ] **Step 2: Write the failing test** (append to the `describe` in `categories.test.ts`; import `setAssetTrusted`):

```ts
  it("trusts and untrusts an asset once, old documents included", () => {
    const old = utils.createDocument();
    delete (old.state.global as { trustedAssets?: unknown }).trustedAssets;
    const asset = "eip155:137/erc20:0x9e2d266d6c90f6c0d80a88159b15958f7135b8af";
    let doc = reducer(old, setAssetTrusted({ asset, trusted: true }));
    doc = reducer(doc, setAssetTrusted({ asset, trusted: true }));
    expect(doc.state.global.trustedAssets).toEqual([asset]);
    doc = reducer(doc, setAssetTrusted({ asset, trusted: false }));
    expect(doc.state.global.trustedAssets).toEqual([]);
  });
```

- [ ] **Step 3: Implement** in `portfolioCategoriesOperations`:

```ts
  setAssetTrustedOperation(state, action) {
    const loaded = state as Partial<PortfolioState>;
    const trusted = (loaded.trustedAssets ??= []);
    const { asset } = action.input;
    if (action.input.trusted) {
      if (!trusted.includes(asset)) trusted.push(asset);
    } else {
      loaded.trustedAssets = trusted.filter((a) => a !== asset);
    }
  },
```

- [ ] **Step 4: Run** `npx vitest run document-models/portfolio/v1/tests/categories.test.ts` → PASS; `npm run tsc`, `npm run lint:fix`, `npm run test:coverage` → reducers ≥ 95%.
- [ ] **Step 5: Commit** reducer, test and the generated `gen/` + model JSON: `git add document-models/portfolio && git commit -m "feat(portfolio): trusted assets, the user's answer to a spam call"`.

---

### Task 2: Classifier — SPAM and known airdrop claims

**Files:**
- Create: `processors/shared/airdrops.ts`
- Modify: `processors/shared/categories.ts`
- Test: `processors/shared/categories.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `TxCategory` gains `"SPAM"`.
  - `ClassifyContext` gains optional `pricedAssets?: ReadonlySet<string>` and `trustedAssets?: ReadonlySet<string>` (absent ⇒ no spam detection, so existing callers are unchanged).
  - `KNOWN_AIRDROPS: ReadonlyMap<string, string>` keyed `` `${chainId}:${lowercase address}` `` → label; `airdropDistributor(chainId: number | undefined, counterparty: string | null): string | undefined`.
  - `signedTransactions(events: ClassifyEvent[]): Set<string>` returning `` `${wallet.lower}|${txHash}` `` keys.

- [ ] **Step 1: Create `processors/shared/airdrops.ts`** (addresses verified 2026-11-14 as the payers of the user's own claim receipts):

```ts
/**
 * Official airdrop claim contracts. A receipt from one is an airdrop claim:
 * booked AIRDROP_NON_TAXABLE by default (BMF 10.05.2022 - income only where
 * the recipient gave something in return); a rule or override changes it.
 */
export const KNOWN_AIRDROPS: ReadonlyMap<string, string> = new Map([
  ["1:0x090d4613473dee047c3f2706764f49e0821d256e", "Uniswap UNI airdrop"],
  ["42161:0x67a24ce4321ab3af51c2d0a4801c3e111d88c9d9", "Arbitrum ARB airdrop"],
  ["1:0xc18360217d8f7ab5e7c516566761ea12ce7f9d72", "ENS airdrop"],
  ["1:0x090e53c44e8a9b6b1bca800e881455b921aec420", "ParaSwap PSP airdrop"],
  ["1:0xde3e5a990bce7fc60a6f017e7c4a95fc4939299e", "Gitcoin GTC airdrop"],
]);

export function airdropDistributor(
  chainId: number | undefined,
  counterparty: string | null,
): string | undefined {
  if (!counterparty) return undefined;
  return KNOWN_AIRDROPS.get(`${chainId ?? 1}:${counterparty.toLowerCase()}`);
}
```

- [ ] **Step 2: Write the failing tests** (append to `categories.test.ts`, reusing its event/context helpers; adapt helper names to the file's own):

```ts
describe("spam and airdrops", () => {
  const W = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
  const SPAM = "eip155:137/erc20:0x9e2d266d6c90f6c0d80a88159b15958f7135b8af";
  const POL = "eip155:137/slip44:60";
  const base = { wallet: W, sequenceIndex: 0, subtype: "NONE", chainId: 137 };
  const ctx = (over: Partial<ClassifyContext> = {}): ClassifyContext => ({
    knownAddresses: new Set([W]), rules: [], overrides: new Map(),
    pricedAssets: new Set([POL]), trustedAssets: new Set(), ...over,
  });
  const pushed = { ...base, id: "a", eventIdentifier: "0x" + "a".repeat(64), type: "RECEIVE",
    asset: SPAM, amount: "923", counterparty: "0xd152f549545093347a162dce210e7293f1452150" };
  const planted = { ...base, id: "b", eventIdentifier: "0x" + "b".repeat(64), type: "SPEND",
    asset: SPAM, amount: "1", counterparty: "0x5ec006c84541019d184aad77db1cd76baa361419" };

  it("calls an unsigned, unpriced token spam, fake outgoing transfers included", () => {
    const out = classify([pushed, planted], ctx());
    expect(out.get(overrideKey(W, "a", 0))).toMatchObject({ category: "SPAM", source: "auto" });
    expect(out.get(overrideKey(W, "b", 0))).toMatchObject({ category: "SPAM", source: "auto" });
  });

  it("keeps a token the wallet moved itself, a priced one and a trusted one", () => {
    const fee = { ...base, id: "f", eventIdentifier: planted.eventIdentifier, sequenceIndex: 1,
      type: "SPEND", subtype: "FEE", asset: POL, amount: "1", counterparty: null };
    expect(classify([pushed, planted, fee], ctx()).get(overrideKey(W, "a", 0))?.category).not.toBe("SPAM");
    expect(classify([pushed], ctx({ pricedAssets: new Set([SPAM]) })).get(overrideKey(W, "a", 0))?.category).not.toBe("SPAM");
    expect(classify([pushed], ctx({ trustedAssets: new Set([SPAM]) })).get(overrideKey(W, "a", 0))?.category).not.toBe("SPAM");
  });

  it("lets a rule or an override beat the spam call", () => {
    const rule = { id: "r", counterparty: pushed.counterparty, chainId: null, direction: "IN",
      asset: null, category: "AIRDROP", label: null };
    expect(classify([pushed], ctx({ rules: [rule] })).get(overrideKey(W, "a", 0))?.category).toBe("AIRDROP");
  });

  it("never calls a native asset spam, and is off without priced assets", () => {
    const native = { ...pushed, asset: POL, id: "n" };
    expect(classify([native], ctx({ pricedAssets: new Set() })).get(overrideKey(W, "n", 0))?.category).toBe("UNCLASSIFIED");
    expect(classify([pushed], ctx({ pricedAssets: undefined })).get(overrideKey(W, "a", 0))?.category).toBe("UNCLASSIFIED");
  });

  it("books a claim from a known distributor as a non-taxable airdrop", () => {
    const arb = { ...base, chainId: 42161, id: "c", eventIdentifier: "0x" + "c".repeat(64),
      type: "RECEIVE", asset: "eip155:42161/erc20:0x912ce59144191c1204e64559fe8253a0e49e6548",
      amount: "1000", counterparty: "0x67A24CE4321aB3aF51c2D0a4801c3E111D88C9d9" };
    expect(classify([arb], ctx({ pricedAssets: new Set([arb.asset]) })).get(overrideKey(W, "c", 0)))
      .toMatchObject({ category: "AIRDROP_NON_TAXABLE", source: "auto" });
  });
});
```

- [ ] **Step 3: Run** `npx vitest run processors/shared/categories.test.ts` → the new tests FAIL.

- [ ] **Step 4: Implement** in `categories.ts`:
  - add `| "SPAM"` to `TxCategory`; add `pricedAssets?` / `trustedAssets?` (with doc comments) to `ClassifyContext`;
  - add and export:

```ts
/** (wallet, transaction) pairs the wallet paid gas for: it signed them. */
export function signedTransactions(events: ClassifyEvent[]): Set<string> {
  const signed = new Set<string>();
  for (const event of events) {
    if (event.subtype === "FEE") {
      signed.add(`${event.wallet.toLowerCase()}|${txHashOf(event.eventIdentifier)}`);
    }
  }
  return signed;
}

/** ERC-20s no wallet of the portfolio ever moved in a transaction it signed,
 * with no price anywhere: pushed airdrops and planted transfers. */
function spamAssets(events: ClassifyEvent[], ctx: ClassifyContext): Set<string> {
  if (!ctx.pricedAssets) return new Set();
  const signed = signedTransactions(events);
  const touched = new Set<string>();
  const candidates = new Set<string>();
  for (const event of events) {
    if (!event.asset.includes("/erc20:")) continue;
    candidates.add(event.asset);
    if (signed.has(`${event.wallet.toLowerCase()}|${txHashOf(event.eventIdentifier)}`)) {
      touched.add(event.asset);
    }
  }
  return new Set(
    [...candidates].filter(
      (asset) => !touched.has(asset) && !ctx.pricedAssets?.has(asset) && !ctx.trustedAssets?.has(asset),
    ),
  );
}
```

  - in `classify`, compute `const spam = spamAssets(events, ctx);` once; after the rule branch and before `derived`, add:

```ts
    if (spam.has(event.asset)) {
      result.set(key, { category: "SPAM", source: "auto", giftCost: null, giftAcquiredAt: null });
      continue;
    }
```

  - in `derived`, right after the STAKING/WITHDRAWAL block, add:

```ts
  if (direction === "in" && airdropDistributor(event.chainId, event.counterparty)) {
    return "AIRDROP_NON_TAXABLE";
  }
```

  (import `airdropDistributor` from `./airdrops.js`; update the file's header comment to mention spam and airdrop claims).

- [ ] **Step 5: Run** the test file → PASS; `npm run tsc`; `npm run lint:fix`.
- [ ] **Step 6: Commit** `git add processors/shared && git commit -m "feat(categories): spam tokens and known airdrop claims classify on their own"`.

---

### Task 3: Accounting index — stage trusted assets, feed prices, re-fold

**Files:**
- Modify: `processors/accounting-index/migrations.ts` (table `acc_trusted_assets` like `acc_ignored_assets`, plus the down-migration list)
- Modify: `processors/accounting-index/schema.ts` (`TrustedAssetRow`, `acc_trusted_assets` in `DB`)
- Modify: `processors/accounting-index/stage.ts` (`portfolioTrustedAssetRows`; `foldInputHash` gains `trustedAssets: string[] = []`)
- Modify: `processors/accounting-index/fold.ts` (`FoldContext.trustedAssets?`; `foldAll` passes `pricedAssets`/`trustedAssets`)
- Modify: `processors/accounting-index/processor.ts` (write/read the table; FOLD_VERSION 6)
- Test: `processors/accounting-index/fold.test.ts`, `processors/accounting-index/processor.test.ts`

**Interfaces:**
- Consumes: `ClassifyContext.pricedAssets/trustedAssets`, category `"SPAM"` (Task 2).
- Produces: `acc_event_categories` rows with category `SPAM` and `AIRDROP_NON_TAXABLE`; table `acc_trusted_assets(document_id, asset)`.

- [ ] **Step 1: Write the failing fold test** (in the "books by tax category" describe of `fold.test.ts`, using its `event()` helper and `ctx`):

```ts
  it("leaves spam out of the books and books a known claim at cost 0", () => {
    const spam = "eip155:1/erc20:0x9e2d266d6c90f6c0d80a88159b15958f7135b8af";
    const state = foldAll(
      [
        event({ id: "s", type: "RECEIVE", asset: spam, amount: "1000", counterparty: "0xd152f549545093347a162dce210e7293f1452150", valuation: null }),
        event({ id: "u", type: "RECEIVE", amount: "1000000000000000000", counterparty: "0x090d4613473dee047c3f2706764f49e0821d256e" }),
      ],
      { ...ctx, decimals: new Map([...ctx.decimals, [spam, 18]]) },
    );
    expect(state.categories.get(overrideKey(W, "s", 0))?.category).toBe("SPAM");
    expect([...state.lots.values()].flat().some((lot) => lot.asset === spam)).toBe(false);
    expect(state.categories.get(overrideKey(W, "u", 0))?.category).toBe("AIRDROP_NON_TAXABLE");
    expect([...state.lots.values()].flat().find((lot) => lot.sourceEventId === "u")?.cost).toBe(0n);
  });
```

  (`W`, `ctx`, `event` are the file's existing names; the second event's asset is the helper's default priced asset.)

- [ ] **Step 2: Run** `npx vitest run processors/accounting-index/fold.test.ts` → FAIL (category UNCLASSIFIED).

- [ ] **Step 3: Implement `foldAll`:**

```ts
  const live = events.filter((event) => !event.ignored);
  const pricedAssets = new Set(
    live
      .filter((event) => event.valuation && event.valuation.source !== "UNPRICED")
      .map((event) => event.asset),
  );
  state.categories = classify(
    live.map((event) => ({ ...event, chainId: Number(/^eip155:(\d+)\//.exec(event.asset)?.[1] ?? 1) })),
    {
      knownAddresses: ctx.knownAddresses,
      rules: ctx.rules,
      overrides: ctx.overrides,
      pricedAssets,
      trustedAssets: ctx.trustedAssets ?? new Set(),
    },
  );
```

  and add `/** Assets the user marked "not spam". */ trustedAssets?: ReadonlySet<string>;` to `FoldContext`. Run the fold test → PASS.

- [ ] **Step 4: Stage the trusted list.** In `stage.ts` add, next to `portfolioIgnoredAssetRows`:

```ts
/** Assets the user marked "not spam": the spam call never flags them. */
export function portfolioTrustedAssetRows(
  documentId: string,
  state: unknown,
): { document_id: string; asset: string }[] {
  const global = asRecord(unwrapState(state));
  const assets = global && Array.isArray(global.trustedAssets) ? global.trustedAssets : [];
  return [...new Set(assets.filter((a): a is string => typeof a === "string" && a !== ""))].map(
    (asset) => ({ document_id: documentId, asset }),
  );
}
```

  Extend `foldInputHash` with a 6th parameter `trustedAssets: string[] = []`, appended to `context` only when non-empty (`...(trustedAssets.length > 0 ? ["trusted:" + [...trustedAssets].sort().join(",")] : [])`) so stored hashes stay valid.
  Migration: `createTable("acc_trusted_assets")` with the same columns/PK shape as `acc_ignored_assets` (`acc_trusted_assets_pk`), `.ifNotExists()`, and add it to the down-migration drop list. Schema: `export interface TrustedAssetRow { document_id: string; asset: string }` and `acc_trusted_assets: TrustedAssetRow` in `DB`.
  Processor: generalise `writeIgnoredAssets` into `writeAssetList(table: "acc_ignored_assets" | "acc_trusted_assets", documentId, rows)` and call it for both where the portfolio document is staged; in `recomputeFold` read `acc_trusted_assets`, pass it to `foldInputHash` and as `trustedAssets: new Set(trusted)` in the ctx; set `FOLD_VERSION = 6` with the comment `// 6: spam tokens and known airdrop claims classify automatically.`

- [ ] **Step 5: Processor test.** In `processor.test.ts` add a test that stages a portfolio with `trustedAssets: [spamAsset]` plus a wallet with one unsigned unpriced receipt of it, and asserts `acc_event_categories` holds `UNCLASSIFIED` for it; then re-stages without the trust and asserts `SPAM`. Follow the file's existing override test for staging helpers.

- [ ] **Step 6: Run** `npx vitest run processors/accounting-index` → PASS; `npm run tsc`; `npm run lint:fix`.
- [ ] **Step 7: Commit** `git add processors/accounting-index && git commit -m "feat(accounting): spam and airdrop claims in the books, trusted assets staged"`.

---

### Task 4: Subgraph — `classificationQueue`

**Files:**
- Create: `subgraphs/portfolio-api/queue.ts`, `subgraphs/portfolio-api/queue.test.ts`
- Modify: `subgraphs/portfolio-api/schema.ts`, `subgraphs/portfolio-api/resolvers.ts`, `subgraphs/portfolio-api/resolvers.test.ts`

**Interfaces:**
- Consumes: `acc_event_categories`, `acc_events`, `acc_assets`, `acc_ignored_assets`, `acc_addresses` (accounting namespace).
- Produces GraphQL:

```graphql
  type PortfolioApiQueueGroup {
    "Lower-cased address, a protocol id, or null for legs without a counterparty."
    counterparty: String
    counterpartyLabel: String
    direction: String!        # IN | OUT
    count: Int!
    "Sum of the priced legs in EUR; null when none is priced."
    value: String
    assets: [String!]!
    "Every leg was pushed to the wallet (unsigned), priced, inbound."
    suspectedAirdrop: Boolean!
    "Ledger event keys, at most 500: wallet|eventId|sequenceIndex."
    events: [String!]!
  }
  type PortfolioApiQueue {
    total: Int!
    value: String
    groups: [PortfolioApiQueueGroup!]!
  }
  # in PortfolioApiSubgraphQueries:
  classificationQueue(driveId: String!, addresses: [String!]): PortfolioApiQueue!
```

  and `queueGroups(rows: QueueLeg[], signed: Set<string>, decimals: Map<string, number>): { total: number; value: string | null; groups: QueueGroup[] }` from `queue.ts`.

- [ ] **Step 1: Write `queue.test.ts`:**

```ts
import { describe, expect, it } from "vitest";
import { queueGroups, type QueueLeg } from "./queue.js";

const W = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const leg = (over: Partial<QueueLeg>): QueueLeg => ({
  wallet: W, eventId: "e", sequenceIndex: 0, eventIdentifier: "0x" + "1".repeat(64),
  type: "RECEIVE", asset: "eip155:1/erc20:0xaa", amount: "1000000000000000000",
  counterparty: "0xBEEF", price: "2", priceUnit: "EUR", ...over,
});

describe("queueGroups", () => {
  it("groups by counterparty and direction, largest EUR value first", () => {
    const out = queueGroups(
      [
        leg({ eventId: "a" }),
        leg({ eventId: "b", amount: "3000000000000000000" }),
        leg({ eventId: "c", type: "SPEND", counterparty: "0xcafe", price: "100" }),
        leg({ eventId: "d", counterparty: null, price: null }),
      ],
      new Set([`${W}|${"0x" + "1".repeat(64)}`]),
      new Map([["eip155:1/erc20:0xaa", 18]]),
    );
    expect(out.total).toBe(4);
    expect(out.value).toBe("108");
    expect(out.groups.map((g) => [g.counterparty, g.direction, g.count, g.value])).toEqual([
      ["0xcafe", "OUT", 1, "100"],
      ["0xbeef", "IN", 2, "8"],
      [null, "IN", 1, null],
    ]);
    expect(out.groups[1].events).toEqual([`${W}|a|0`, `${W}|b|0`]);
  });

  it("flags an inbound, unsigned, priced group as a suspected airdrop", () => {
    const out = queueGroups([leg({})], new Set(), new Map([["eip155:1/erc20:0xaa", 18]]));
    expect(out.groups[0].suspectedAirdrop).toBe(true);
    const signed = queueGroups([leg({})], new Set([`${W}|${"0x" + "1".repeat(64)}`]), new Map([["eip155:1/erc20:0xaa", 18]]));
    expect(signed.groups[0].suspectedAirdrop).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run subgraphs/portfolio-api/queue.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `queue.ts`:**

```ts
/**
 * The review queue: UNCLASSIFIED legs grouped by who was on the other side
 * and which way value moved, largest EUR value first, so one decision
 * (a rule, or a category for the group) settles many rows.
 */
import { txHashOf } from "../../processors/shared/categories.js";

export interface QueueLeg {
  wallet: string;
  eventId: string;
  sequenceIndex: number;
  eventIdentifier: string;
  type: string;
  asset: string;
  amount: string;
  counterparty: string | null;
  price: string | null;
  priceUnit: string | null;
}

export interface QueueGroup {
  counterparty: string | null;
  direction: "IN" | "OUT";
  count: number;
  value: string | null;
  assets: string[];
  suspectedAirdrop: boolean;
  events: string[];
}

const SCALE = 10n ** 8n;
const MAX_EVENTS = 500;

/** EUR value scaled by 1e8, or null when the leg has no EUR price. */
function legValue(leg: QueueLeg, decimals: Map<string, number>): bigint | null {
  const places = decimals.get(leg.asset);
  if (leg.price === null || leg.priceUnit !== "EUR" || places === undefined) return null;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(leg.price);
  if (!match) return null;
  const price = BigInt(match[1]) * SCALE + BigInt((match[2] ?? "").padEnd(8, "0").slice(0, 8));
  return (BigInt(leg.amount) * price) / 10n ** BigInt(places);
}

function format(scaled: bigint): string {
  const whole = scaled / SCALE;
  const fraction = (scaled % SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function queueGroups(
  legs: QueueLeg[],
  signed: Set<string>,
  decimals: Map<string, number>,
): { total: number; value: string | null; groups: QueueGroup[] } {
  const groups = new Map<string, QueueGroup & { scaled: bigint | null; pushed: boolean }>();
  let total: bigint | null = null;
  for (const leg of legs) {
    const direction = leg.type === "SPEND" ? "OUT" : "IN";
    const counterparty = leg.counterparty?.toLowerCase() ?? null;
    const id = `${counterparty ?? ""}|${direction}`;
    const group = groups.get(id) ?? {
      counterparty, direction, count: 0, value: null, assets: [], suspectedAirdrop: false,
      events: [], scaled: null, pushed: true,
    };
    group.count += 1;
    if (!group.assets.includes(leg.asset)) group.assets.push(leg.asset);
    if (group.events.length < MAX_EVENTS) {
      group.events.push(`${leg.wallet}|${leg.eventId}|${leg.sequenceIndex}`);
    }
    const value = legValue(leg, decimals);
    if (value === null || signed.has(`${leg.wallet}|${txHashOf(leg.eventIdentifier)}`)) {
      group.pushed = false;
    }
    if (value !== null) {
      group.scaled = (group.scaled ?? 0n) + value;
      total = (total ?? 0n) + value;
    }
    groups.set(id, group);
  }
  const list = [...groups.values()].map(({ scaled, pushed, ...group }) => ({
    ...group,
    value: scaled === null ? null : format(scaled),
    suspectedAirdrop: pushed && group.direction === "IN" && group.counterparty?.startsWith("0x") === true,
    sort: scaled ?? -1n,
  }));
  list.sort((a, b) => (a.sort === b.sort ? b.count - a.count : a.sort > b.sort ? -1 : 1));
  return {
    total: legs.length,
    value: total === null ? null : format(total),
    groups: list.map(({ sort: _sort, ...group }) => group),
  };
}
```

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: Schema + resolver.** Add the types and query field above to `schema.ts`. In `resolvers.ts` add a `classificationQueue` resolver beside `events`:

```ts
      classificationQueue: async (
        _parent: unknown,
        args: { driveId: string; addresses?: string[] },
        ctx: Context,
      ) => {
        const empty = { total: 0, value: null, groups: [] };
        const ids = await driveFileIds(subgraph, args.driveId, ctx);
        if (!ids || ids.length === 0) return empty;
        const acc = accountingQuery(args.driveId);
        const ignoredAssets = await ignoredAssetsOf(args.driveId);
        const scope = (args.addresses ?? []).map((a) => a.toLowerCase());
        const legs = await acc
          .selectFrom("acc_event_categories as c")
          .innerJoin("acc_events as e", (join) =>
            join
              .onRef("e.wallet", "=", "c.wallet")
              .onRef("e.event_id", "=", "c.event_id")
              .onRef("e.sequence_index", "=", "c.sequence_index"),
          )
          .where("c.category", "=", "UNCLASSIFIED")
          .where("e.document_id", "in", ids)
          .where("e.ignored", "=", false)
          .$if(ignoredAssets.size > 0, (qb) => qb.where("e.asset", "not in", [...ignoredAssets]))
          .$if(scope.length > 0, (qb) => qb.where("e.wallet", "in", scope))
          .select([
            "e.wallet", "e.event_id as eventId", "e.sequence_index as sequenceIndex",
            "e.event_identifier as eventIdentifier", "e.type", "e.asset", "e.amount",
            "e.counterparty", "e.price", "e.price_unit as priceUnit",
          ])
          .execute();
        if (legs.length === 0) return empty;
        const fees = await acc
          .selectFrom("acc_events")
          .where("document_id", "in", ids)
          .where("subtype", "=", "FEE")
          .select(["wallet", "event_identifier as eventIdentifier"])
          .execute();
        const signed = new Set(fees.map((f) => `${f.wallet}|${txHashOf(f.eventIdentifier)}`));
        const decimals = new Map(
          (await acc.selectFrom("acc_assets").select(["asset", "decimals"]).execute()).map(
            (a) => [a.asset, a.decimals] as const,
          ),
        );
        const queue = queueGroups(legs, signed, decimals);
        const labels = await labelsByAddress(args.driveId, ctx); // reuse the helper addressLabels uses
        return {
          ...queue,
          groups: queue.groups.map((g) => ({
            ...g,
            counterpartyLabel: g.counterparty ? labels.get(g.counterparty) ?? null : null,
          })),
        };
      },
```

  Find how `addressLabels` builds its list and extract it into a `labelsByAddress(driveId, ctx): Promise<Map<string, string>>` helper (lower-cased address → label) used by both resolvers. Add a resolver test in `resolvers.test.ts` following the `events` category test: two UNCLASSIFIED legs from one counterparty and one ignored-asset leg → one group, count 2.

- [ ] **Step 6: Run** `npx vitest run subgraphs/portfolio-api` → PASS; `npm run tsc`; `npm run lint:fix`.
- [ ] **Step 7: Commit** `git add subgraphs/portfolio-api && git commit -m "feat(portfolio-api): classification queue grouped by counterparty"`.

---

### Task 5: Editor data layer — queue hook and category actions

**Files:**
- Modify: `editors/stackfolio/lib/graphql.ts` (types `QueueGroup`, `Queue`; `PortfolioApi.classificationQueue`; `useClassificationQueue(driveId, addresses?)`)
- Modify: `editors/stackfolio/lib/mutations.ts` (category, trust and ignore actions)
- Create: `editors/stackfolio/lib/categories.ts` (labels, groups for selects, input builders)
- Test: `editors/stackfolio/lib/categories.test.ts`, `editors/stackfolio/lib/mutations.test.ts`

**Interfaces:**
- Produces:
  - `CATEGORY_LABEL: Record<string, string>` (every `TxCategory` incl. `SPAM`, `UNCLASSIFIED` → plain English, e.g. `AIRDROP_NON_TAXABLE: "Airdrop (non-taxable)"`).
  - `CATEGORY_CHOICES: { group: string; options: string[] }[]` for `<optgroup>`s: Trades (TRADE, SPEND, LIQUIDATION), Income (INCOME, STAKING, LENDING_INCOME, MINING, AIRDROP, AIRDROP_NON_TAXABLE), Own moves (DEPOSIT, WITHDRAWAL, COLLATERAL_OUT, COLLATERAL_IN), Loans (BORROWING, LOAN_REPAYMENT), Gifts & losses (GIFT_IN, GIFT_OUT, DONATION, LOST, STOLEN), Other (FEE, MARGIN).
  - `parseEventKey(key: string): { wallet: string; eventId: string; sequenceIndex: number }`.
  - `overridesInput(keys: string[], category: string, gift?: { cost?: string; acquiredAt?: string })` → SET_EVENT_CATEGORIES input (gift fields only for GIFT_IN, blanks omitted).
  - `ruleInput(id: string, counterparty: string, direction: "IN" | "OUT", category: string, label?: string)` → ADD_CATEGORY_RULE input (label trimmed, omitted when blank).
  - `usePortfolioActions` gains `setEventCategories(input)`, `clearEventCategories(input)`, `addCategoryRule(input)`, `setAssetIgnored(asset, ignored)`, `setAssetTrusted(asset, trusted)`.

- [ ] **Step 1: Failing tests** in `lib/categories.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATEGORY_CHOICES, CATEGORY_LABEL, overridesInput, parseEventKey, ruleInput } from "./categories.js";

describe("category helpers", () => {
  it("labels every choice", () => {
    for (const { options } of CATEGORY_CHOICES) for (const o of options) expect(CATEGORY_LABEL[o]).toBeTruthy();
  });
  it("splits an event key, wallets with pipes impossible", () => {
    expect(parseEventKey("0xab|ev-1|3")).toEqual({ wallet: "0xab", eventId: "ev-1", sequenceIndex: 3 });
  });
  it("builds overrides, gift fields only on GIFT_IN", () => {
    expect(overridesInput(["0xab|e|0"], "GIFT_IN", { cost: "10.5", acquiredAt: "" })).toEqual({
      overrides: [{ wallet: "0xab", eventId: "e", sequenceIndex: 0, category: "GIFT_IN", giftCost: "10.5" }],
    });
    expect(overridesInput(["0xab|e|0"], "LOST", { cost: "1" }).overrides[0]).not.toHaveProperty("giftCost");
  });
  it("builds a rule input with an optional label", () => {
    expect(ruleInput("r", "0xCAFE", "IN", "INCOME", "  ")).toEqual({
      id: "r", counterparty: "0xcafe", direction: "IN", category: "INCOME",
    });
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `lib/categories.ts` exactly to those signatures (event ids may contain `-` but never `|`; split on the first and last `|`). Add the mutations (`portfolioActions.setEventCategories`, `.clearEventCategories`, `.addCategoryRule`, `.setAssetIgnored`, `.setAssetTrusted`) and the hook:

```ts
export interface QueueGroup {
  counterparty: string | null;
  counterpartyLabel: string | null;
  direction: "IN" | "OUT";
  count: number;
  value: string | null;
  assets: string[];
  suspectedAirdrop: boolean;
  events: string[];
}
export interface Queue { total: number; value: string | null; groups: QueueGroup[] }

export function useClassificationQueue(driveId: string, addresses?: string[]): QueryState<Queue> {
  return usePortfolioField(
    `query ($driveId: String! $addresses: [String!]) { portfolioApi { classificationQueue(driveId: $driveId addresses: $addresses) { total value groups { counterparty counterpartyLabel direction count value assets suspectedAirdrop events } } } }`,
    { driveId, ...(addresses?.length ? { addresses } : {}) },
    "classificationQueue",
  );
}
```

  Extend `graphql.schema.test.ts` if it checks query fields against the subgraph schema.
- [ ] **Step 4: Run** `npx vitest run editors/stackfolio/lib` → PASS; tsc; lint.
- [ ] **Step 5: Commit** `git add editors/stackfolio/lib && git commit -m "feat(editor): classification queue query and category actions"`.

---

### Task 6: "Needs a type" — the review queue view

**Files:**
- Create: `editors/stackfolio/components/ReviewQueue.tsx`, `editors/stackfolio/components/ReviewQueue.test.tsx`
- Modify: `editors/stackfolio/components/Transactions.tsx` (`HistorySub` adds `"queue"`; a third sub-tab button "Needs a type (N)"; render `queue` prop when active)
- Modify: `editors/stackfolio/components/sections.tsx` (`TransactionsSection` loads the queue, passes actions; `?sub=queue`)
- Modify: `editors/stackfolio/editor.tsx` (pass `portfolioActions` into `TransactionsSection`)

**Interfaces:**
- Consumes: `useClassificationQueue`, `CATEGORY_CHOICES`, `CATEGORY_LABEL`, `overridesInput`, `ruleInput`, `usePortfolioActions` (Task 5).
- Produces: `ReviewQueue({ queue, symbolOf, actions, onOpenEvents, onChanged })`, where `actions: Pick<ReturnType<typeof usePortfolioActions>, "ready" | "setEventCategories" | "addCategoryRule" | "setAssetIgnored">`, `onOpenEvents(keys: string[])` opens History filtered to those events.

Behaviour per group row:
- Header: label or short address (or "No counterparty"), direction arrow, `count` legs, EUR value, asset symbols (first 4 + "+N"), a "suspected airdrop" chip.
- Category `<select>` (CATEGORY_CHOICES optgroups; suspected-airdrop groups preselect `AIRDROP_NON_TAXABLE`), optional rule label input.
- "Always for this address" → `addCategoryRule(ruleInput(crypto.randomUUID(), counterparty, direction, category, label))`; disabled when the counterparty is not a `0x` address (protocol ids), with the title "Rules need an address; use 'Only these'".
- "Only these N" → `setEventCategories(overridesInput(group.events, category))`; disabled when `count > group.events.length` (more than 500), title "Too many for one-off choices; use a rule".
- Suspected-airdrop groups also get "Spam" → `setAssetIgnored(asset, true)` for each of `group.assets`.
- "Show" → `onOpenEvents(group.events)`.
- Empty queue: "Every transaction has a type."
- After an accepted action call `onChanged()` (reloads queue and events; the books catch up asynchronously, so show "Saved — the queue updates when the books catch up.").

- [ ] **Step 1: Failing test** `ReviewQueue.test.tsx` (Testing Library, like `Transactions.test.tsx`): render two groups (one suspected airdrop with `assets: ["a1"]`, one protocol id `uniswap-v2`); assert (a) the suspected group's select shows "Airdrop (non-taxable)"; (b) clicking "Always for this address" on it calls `addCategoryRule` with `{ counterparty: "0xd152…", direction: "IN", category: "AIRDROP_NON_TAXABLE" }`; (c) "Spam" calls `setAssetIgnored("a1", true)`; (d) the protocol group's rule button is disabled and "Only these 2" calls `setEventCategories` with two overrides.
- [ ] **Step 2: Run** `npx vitest run editors/stackfolio/components/ReviewQueue.test.tsx` → FAIL.
- [ ] **Step 3: Implement** `ReviewQueue.tsx` with the behaviour above, styling as the existing tables (`text-xs`, `border-border`, `rounded-lg`); wire the sub-tab in `Transactions.tsx` (`data-sub="queue"`, count from `queue.data?.total`), and in `TransactionsSection` call `useClassificationQueue(driveId, addressesOf(wallets).addresses)`, map `sub === "queue"`, and `onOpenEvents` → `setFilter({ ignored: false, first: 50, ids: keys.map((k) => parseEventKey(k).eventId) })` plus switching to the events sub-tab.
- [ ] **Step 4: Run** component tests → PASS; tsc; lint.
- [ ] **Step 5: Commit** `git add editors/stackfolio && git commit -m "feat(editor): needs-a-type review queue on the History page"`.

---

### Task 7: Category in the event detail (GIFT_IN cost and date)

**Files:**
- Modify: `editors/stackfolio/components/EventReview.tsx`, `editors/stackfolio/components/EventDetail.tsx`
- Test: `editors/stackfolio/components/EventDetail.test.tsx`

**Interfaces:**
- Consumes: `EventRow.category/categorySource`, `overridesInput`, `usePortfolioActions().setEventCategories/clearEventCategories`.

- [ ] **Step 1: Failing test:** rendering an UNCLASSIFIED event shows a "Tax category" select; choosing "Gift received" reveals "Giver's cost (EUR)" and "Giver's purchase date"; saving calls `setEventCategories` with `giftCost` and `giftAcquiredAt` (ISO at 00:00Z); an event with `categorySource: "override"` shows "Reset to automatic", which calls `clearEventCategories({ events: [{ wallet, eventId, sequenceIndex }] })`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** a "Tax category" block at the top of `EventReview` (select from `CATEGORY_CHOICES`, source badge, GIFT_IN fields validated with `/^(0|[1-9]\d*)(\.\d+)?$/` before dispatch, reset button for overrides). Move the raw type/subtype editor into a `<details><summary>Raw type</summary>` block (kept for decoder fixes). `EventReview` needs the portfolio actions: pass them down from `EventDetail` (which already receives the portfolio id via the shell; follow `AssetDetail`'s `usePortfolioActions(portfolioId)`).
- [ ] **Step 4: Run** → PASS; tsc; lint. **Step 5: Commit** `git commit -m "feat(editor): set an event's tax category, gifts with the giver's basis"` (explicit paths).

---

### Task 8: Category badges and filter in the event list

**Files:**
- Modify: `editors/stackfolio/components/Transactions.tsx`, `editors/stackfolio/components/Transactions.test.tsx`

- [ ] **Step 1: Failing test:** a row with `category: "SPAM", categorySource: "auto"` shows a "Spam" badge with `title="automatic"`; selecting "Unclassified" in the new category `<select>` calls `setFilter` with `categories: ["UNCLASSIFIED"]`; the CSV gets a `category` column.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement:** a `Category` column after "Type" rendering `CATEGORY_LABEL[category]` in a pill (UNCLASSIFIED amber, SPAM muted strike-through, override/rule sources with a small dot and `title` "your choice" / "your rule" / "automatic"); a category select ("All categories", "Unclassified", "Spam", then CATEGORY_CHOICES) next to the asset select; `category` added to `EVENT_HEADERS` and `eventsCsv`.
- [ ] **Step 4: Run** → PASS; tsc; lint. **Step 5: Commit** `git commit -m "feat(editor): category badges, filter and CSV column on History"`.

---

### Task 9: Unclassified notice on Dashboard and P&L

**Files:**
- Create: `editors/stackfolio/components/UnclassifiedNotice.tsx` (+ test)
- Modify: `editors/stackfolio/components/sections.tsx` (DashboardSection, PnlSection render it)

**Interfaces:**
- Produces: `UnclassifiedNotice({ queue, currency, onOpen })` — renders nothing when `queue.total === 0`, else "N transactions unclassified (EUR X) — not in the books yet. Review →"; `onOpen` navigates to History `?sub=queue` (use the shell's existing navigation helper the sidebar uses).

- [ ] **Step 1: Failing test:** total 0 renders nothing; total 12 with value "1234.5" renders "12 transactions unclassified (€1,234.50)" and the button calls `onOpen`.
- [ ] **Step 2–4:** implement with `fmtFiat` from `lib/format.ts` (or the file's existing EUR formatter); place it under the page header in both sections (scoped by the bundle's wallets); run tests, tsc, lint.
- [ ] **Step 5: Commit** `git commit -m "feat(editor): unclassified notice on Dashboard and P&L"`.

---

### Task 10: Verify live, then PR

- [ ] **Step 1:** `npm run test:coverage` (all green, reducers ≥ 95%), `npm run tsc`, `npm run lint:fix`.
- [ ] **Step 2:** `npm run build`, then `restartVetra`; wait for the accounting index to re-fold (FOLD_VERSION 6).
- [ ] **Step 3: Check the live drive** (`22rEHNiqrM-4NFNnfwgJLPlA5MSmjPGcNMe8HhFbWfw`) via `http://localhost:7844/graphql`:
  - category counts: SPAM ≈ 520 rows, AIRDROP_NON_TAXABLE ≥ 5 (UNI, ARB, ENS, PSP, GTC), UNCLASSIFIED down by the spam rows;
  - TKN-9e2d26 (`eip155:137/erc20:0x9e2d266d…`) rows are SPAM;
  - `classificationQueue` groups: Aavegotchi counterparties near the top by count, Disperse (`0xd152…`) gone;
  - P&L income/realized unchanged except airdrop lots now at cost 0.
- [ ] **Step 4: Browser check** with Playwright at `http://localhost:2844/`: History → "Needs a type" shows groups; set one rule on a test group, confirm the queue shrinks after the re-fold, then remove the rule again (REMOVE_CATEGORY_RULE via reactor-mcp) so the user's data is unchanged.
- [ ] **Step 5:** push `feat/review-queue`, open a PR "Tax categories, part 2: spam, airdrops, review queue" with a summary and the live numbers (no attribution lines).
