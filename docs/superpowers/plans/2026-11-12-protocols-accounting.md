# Protocols & Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode known DeFi protocol contract activity into semantic ledger rows, track tokenized/NFT positions and debts, and compute reproducible FCFS cost-basis PnL over the ledger.

**Architecture:** Manifest-driven decoding — a `stackfolio/protocol-registry` document holds per-chain contract addresses and topic0→semantic rules; one pure decode engine consumes tx receipts. Prices are pinned into ledger rows at import (daily-close oracle). A pure FCFS fold over ledger rows runs in a new `accounting-index` processor; results are read models exposed by `portfolio-api`; views render them.

**Tech Stack:** TypeScript, viem, Powerhouse pieces-framework, document models via reactor-mcp (`ph-cli`), processors (SQL read models + migrations), portfolio-api subgraph, React editors.

**Spec:** `docs/superpowers/specs/2026-11-12-protocols-accounting-design.md` — read it alongside every task; it holds the decisions this plan argues from.

## Global Constraints

- rotki is AGPL-3.0: study its constants (addresses, topics, semantics) and re-encode as our data/tests; copy no code.
- Reducers pure and synchronous; ids/dates/rates come from action input. Never edit `gen/`.
- Every document-model change: reactor-mcp (`SET_OPERATION_SCHEMA`/`ADD_OPERATION`, `getCodegenStatus` `settled`) **and** `src/reducers/`; reducers ≥95% coverage on all metrics.
- Import identity stays `eventIdentifier-sequenceIndex` (`IMPORT_EVENTS` dedup unchanged).
- Free API budgets: Etherscan-class ~5 req/s (one logscan per page; receipts only for hits), CoinGecko free daily (`/history`, one call per (asset, day), newest-first).
- Gates after every task: `npm run tsc`, `npm run lint:fix`, `npm run test:coverage`.
- Quote unit comes from the price book's configured unit (existing convention); valuations carry `granularity: "DAY"`.

## Review Focus

Expected behaviors implied by the spec but not obvious from any single task's feature list — each is pinned by a named test in the owning task:

1. A `SPEND` to another of the user's own wallets must move the lot at original cost — no realized PnL, no basis reset (fees still fold).
2. A decoded swap's two legs must net to zero realized PnL except fees — the acquired leg opens at cost-paid, never at its own market price.
3. An event pinned or retyped **after** it was folded must yield a report identical to a genesis replay of the edited ledger.
4. A manifest entry with a wrong topic, unknown plugin, or `RETIRED` status must decode nothing and corrupt nothing (inert, counted).
5. Events with no pinned price (`UNPRICED`) must be counted and surfaced in the report — never silently valued at zero.

---

### Task 1: `stackfolio/protocol-registry` document model

**Files:**
- Create (via reactor-mcp + codegen): `document-models/protocol-registry/v1/` (gen/, module, hooks, schema.graphql)
- Create: `document-models/protocol-registry/v1/src/reducers/registry.ts`
- Create: `document-models/protocol-registry/v1/tests/registry.test.ts`, `tests/scenario.test.ts`, `tests/document-model.test.ts`

**Interfaces:**
- Produces: model `stackfolio/protocol-registry`, state `{ protocols: ProtocolEntry[] }` with
  `ProtocolEntry { id: string, status: "ACTIVE"|"RETIRED", chains: [{ chainId: number, contracts: [{ name, address, kind: "CORE"|"POSITION"|"DEBT", underlying?: string|null }], events: [{ topic, name, semantic: { type: EventType, subtype: EventSubtype } }], plugins: string[], notes: string|null }], updatedAt: string }`;
  ops `REGISTER_PROTOCOL { entry, updatedAt }`, `UPDATE_PROTOCOL { entry, updatedAt }` (full replace by id), `RETIRE_PROTOCOL { id, updatedAt }`.

- [ ] **Step 1: Create the model via reactor-mcp** using the exact state/ops schemas in Interfaces (same model-creation flow used for `hyperliquid-account`; the spec's approval covers the shape).
- [ ] **Step 2: Write the failing reducer tests** — `registry.test.ts`: REGISTER inserts; REGISTER duplicate id rejected (reducer error, not throw); UPDATE replaces the whole entry by id and rejects unknown id; RETIRE flips status, unknown id rejected; scenario test = register aave-v3 → update contracts → retire.
- [ ] **Step 3: Implement `registry.ts`** — pure ops per the generated action types; reject via model error conventions (see `asset-registry/v1/src/reducers/registry.ts`).
- [ ] **Step 4: Regenerate + wire** — `getCodegenStatus { documentId, waitSeconds: 60 }`; register in `document-models/document-models.ts`; run gates; reducers ≥95%.
- [ ] **Step 5: Commit** `feat(protocol-registry): registry document model`.

### Task 2: Manifest types, seed manifests, topics fixture

**Files:**
- Create: `pieces/ethereum/lib/manifest.ts`, `pieces/ethereum/lib/manifests/{aave-v3,sky,uniswap-v2,uniswap-v3,ens}.ts`, `pieces/ethereum/lib/manifests/index.ts`
- Test: `pieces/ethereum/lib/manifest.test.ts`

**Interfaces:**
- Consumes: Task 1 `ProtocolEntry` shape (JSON from the registry document).
- Produces: `interface EventSemantic { type: EventType; subtype: EventSubtype }`, `interface ContractRef { name: string; address: `0x${string}`; kind: "CORE"|"POSITION"|"DEBT"; underlying?: string }`, `interface EventRule { topic: `0x${string}`; name: string; semantic: EventSemantic }`, `interface ChainManifest { chainId: number; contracts: ContractRef[]; events: EventRule[]; plugins: string[] }`, `interface ProtocolManifest { id: string; chains: ChainManifest[]; plugins: string[] }`, `parseProtocolEntry(json: unknown): ProtocolManifest | null` (null on malformed, never throws), `manifestsForChain(entryJsons: unknown[], chainId: number): { protocols: ProtocolManifest[]; contracts: ContractRef[]; events: EventRule[] }` (ACTIVE only).
- Seed constants: addresses and event names copied semantically from `~/projects/rotki/rotkehlchen/chain/evm/decoding/<protocol>/constants.py` (Aave v3 Pool + Supply/Borrow/LiquidationCall event names; Sky SUSDS/PSM addresses + Transfer/Exit semantics; Uni v2 pair Swap; Uni v3 NFT manager + IncreaseLiquidity/DecreaseLiquidity; ENS registrar/controller names).

- [ ] **Step 1: Write the failing topics fixture test** — for every seed `EventRule`, `encodeEventTopic(abiEvent)` from a hand-written viem `parseAbiItem` of the rule's named event **equals** `rule.topic` (this kills the wrong-topic class of bugs at build time, spec §1).
- [ ] **Step 2: Run to verify failure** — `npx vitest run pieces/ethereum/lib/manifest.test.ts` → cannot resolve `manifests/`.
- [ ] **Step 3: Implement** — `manifest.ts` parsers (validate address form, lowercase-normalize; unknown `semantic.subtype` → null) and the five seed modules exporting `ProtocolManifest` for chainId 1 (aave-v3 also 10/42161/137/8453 with those Pool addresses).
- [ ] **Step 4: Run to verify pass** + `parseProtocolEntry` round-trips `REGISTER_PROTOCOL` JSON shapes (add tests: malformed → null; RETIRED filtered by `manifestsForChain`).
- [ ] **Step 5: Commit** `feat(pieces): protocol manifests with verified topic fixtures`.

### Task 3: Ledger schema extensions (subtypes + valuation + ops)

**Files:**
- Modify via reactor-mcp: wallet-account operation schemas (`IMPORT_EVENTS` input), state schema (`LedgerEvent`), new ops; regen `document-models/wallet-account/v1/gen/**`
- Modify: `document-models/wallet-account/v1/src/reducers/feed.ts`, `review.ts`; `pieces/ethereum/lib/types.ts`
- Tests: `document-models/wallet-account/v1/tests/feed.test.ts`, `review.test.ts`, new `valuation.test.ts`

**Interfaces:**
- Produces: `EventSubtype` adds `BORROW`, `REPAY`, `LIQUIDATION`, `YIELD`, `LP_MINT`, `LP_BURN`, `NAME_REGISTRATION`, `BRIDGE`; `Valuation { unit: string, price: string, source: "COINGECKO"|"MANUAL"|"UNPRICED", granularity: "DAY"|"NONE", pinnedAt: string }`; `LedgerEvent.valuation: Valuation | null`; `ImportedEventInput.valuation?`; new ops `PIN_VALUATIONS { events: [{ id, sequenceIndex, valuation }] }`, `REPLACE_EVENTS { remove: [{ id, sequenceIndex }], add: ImportedEventInput[] }`, `SET_ENS_NAMES { names: [{ name, owned }] }` with state `ensNames: [{ name, owned }] | null` (full replace; spec §8).

- [ ] **Step 1: Failing reducer tests** — `valuation.test.ts`: PIN_VALUATIONS sets valuation by (id,sequenceIndex); refuses to overwrite `source: "MANUAL"` with non-MANUAL (row keeps old value, op still succeeds); unknown id counted in result, no throw. `feed.test.ts` extends: new subtypes import cleanly; REPLACE_EVENTS removes named rows then imports additions in one op, carries `ignored`/`notes` from removed row onto same-id addition, drops `RETYPE_EVENT` effect (decoded subtype wins), rejects add-id collision with a surviving row.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: MCP schema changes** (state + ops), reducers in `feed.ts` (replace semantics + carry-over) and `review.ts` (pin rules); sync `types.ts` (`EventSubtype`, `Valuation`, `EventRow` gains `valuation?: Valuation`).
- [ ] **Step 4: Run gates**, reducers ≥95%; `graphql` schema regen committed.
- [ ] **Step 5: Commit** `feat(wallet-account): protocol subtypes, valuations, PIN_VALUATIONS, REPLACE_EVENTS`.

### Task 4: Decode engine + plugin registry

**Files:**
- Create: `pieces/ethereum/lib/protocol-decode.ts`, `pieces/ethereum/lib/plugins/index.ts`
- Test: `pieces/ethereum/lib/protocol-decode.test.ts` with captured-receipt fixtures `pieces/ethereum/lib/__fixtures__/receipts/*.json`

**Interfaces:**
- Consumes: Task 2 `ChainManifest`; Task 3 subtypes.
- Produces: `interface ReceiptLike { hash: string; to: string | null; logs: { address: string; topics: string[]; data: string }[] }` (viem receipt, narrowed), `decodeReceipts(manifest: ChainManifest, account: `0x${string}`, receipts: ReceiptLike[]): { rows: EventRow[]; decodedTxHashes: string[]; inert: number }` — `rows` carry `counterparty = manifest protocol id`, eventIdentifier `txid-logIndex` for log-derived rows, unsigned amounts (spec §2); plugin call signature `(input: unknown) => unknown` looked up by manifest `plugins` name; unknown plugin name → protocol treated as ACTIVE-but-inert (counted in `inert`, rows skipped for that protocol).
- Fixtures: capture one real receipt each (frankp/fr4nk history via indexer) for: aave v3 supply, aave borrow, sky conversion, uni v2 swap, ens registration.

- [ ] **Step 1: Write the failing table test** — per fixture: expected rows (type/subtype/asset/amount/counterparty) golden-matched; unmatched Transfer logs pass through as generic rows; Review-Focus 4 test: rule with mutated topic + unknown plugin → `rows` contains no semantic rows, `inert` > 0, generic rows unchanged.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — candidate = log addresses ∩ contracts (or `to` ∈ contracts); group logs by emitting protocol event → semantic + Transfer legs (from/to of account decide direction; `FEE` legs keep existing subtype rules); dedupe self-transfer logs per `decode.ts` convention.
- [ ] **Step 4: Run gates.**
- [ ] **Step 5: Commit** `feat(pieces): manifest-driven decode engine`.

### Task 5: Etherscan log fetch + merge (history & recent paths)

**Files:**
- Modify: `pieces/ethereum/lib/etherscan.ts` (add `getLogs(addresses, fromBlock, toBlock)`, `getTransactionReceipt(hash)` via `proxy` module), `pieces/ethereum/lib/actions/fetch-etherscan-history.ts`, `fetch-etherscan-recent.ts`
- Test: `pieces/ethereum/lib/etherscan.test.ts`, both action tests

**Interfaces:**
- Consumes: Tasks 2–4 (`manifestsForChain`, `decodeReceipts`); registry document read pattern from `lib/reactor.ts` (actions take `registryDocumentId` as an optional string prop; absent or unreadable → generic-only, never fail the page).
- Produces: per page: one `getLogs` (addresses = chain's registry contracts, ≤20 per call, comma-joined) over the page block window → hit tx hashes → `getTransactionReceipt` per hit (budget: max 20 receipts/page, overflow deferred to next page via existing truncation flag); returned rows = generic − rows whose `eventIdentifier` is a decoded hash + semantic rows.

- [ ] **Step 1: Failing tests** — mocked fetch: logscan built once per page with all contract addresses; receipts fetched only for hits; merged rows replace generic for decoded hashes and keep them otherwise; no registry prop → byte-identical behavior to today (regression pin). `fetch-ens-names`: after reverse+forward-confirmed resolution, dispatches `SET_ENS_NAMES` with `{ name, owned: true }` for the wallet's own document (owned = forward resolution == wallet address).
- [ ] **Step 2: Verify fail. Step 3: Implement** (rate-limit via existing gate.ts budget; fetch-ens-names extends to dispatch when given `documentId`). **Step 4: Gates. Step 5: Commit** `feat(pieces): log-aware etherscan import, ens ownership`.

### Task 6: Historical price pinning

**Files:**
- Create: `pieces/ethereum/lib/history.ts`, `pieces/ethereum/lib/actions/pin-prices.ts`, `pieces/ethereum/lib/actions/pin-prices.test.ts`; modify `pieces/ethereum/index.ts` (export), reconciler specs
- Test: `pieces/ethereum/lib/history.test.ts`

**Interfaces:**
- Consumes: Task 3 `Valuation`/`PIN_VALUATIONS`; `fetch-prices.ts` coingecko-id mapping conventions; existing action pattern "read doc → call oracle → dispatch ops" (`import-tokens-to-registry.ts`).
- Produces: `getDailyClose(coinGeckoId: string, dateUtc: string, platform: PricePlatform): Promise<string | null>` (CoinGecko `/coins/{id}/history?date=DD-MM-YYYY`, null on any miss); action `pin-prices` `{ documentId, max: number }` → reads wallet ledger for rows missing `valuation` (oldest assets newest-first, max rows), resolves one daily close per (asset, day), dispatches `PIN_VALUATIONS` with `source: "COINGECKO", granularity: "DAY"` or `source: "UNPRICED", price: "0"` for misses; `{ priced, unpriced }` out.

- [ ] **Step 1: Failing tests** — mocked HTTP: daily close parse; miss → UNPRICED row pinned not skipped; MANUAL never sent; one call per (asset,day) even for 10 same-day rows.
- [ ] **Step 2: Fail. Step 3: Implement. Step 4: Gates. Step 5: Commit** `feat(pieces): daily-close price pinning`.

### Task 7: Positions & debts (registry kinds, snapshot liabilities, fetch-positions)

**Files:**
- Modify via MCP: asset-registry `kind` enum (`POSITION`, `DEBT`), portfolio `Snapshot` entry (`liabilities: [{asset,amount}]`, `netWorth`), portfolio op `SET_POSITIONS { wallet, chainId, positions: [{ protocol, kind: "SPOT"|"LP", assets: [{asset,amount}], note|null }] }`, `positions: [...]` on PortfolioState; reducers `snapshot.ts`/`positions.ts` + tests
- Create: `pieces/ethereum/lib/plugins/univ3-position-math.ts`, `pieces/ethereum/lib/actions/fetch-positions.ts` (+ tests); modify `actions/snapshot-portfolio.ts`, `actions/import-tokens-to-registry.ts`
- Test: `document-models/portfolio/v1/tests/positions.test.ts`, `snapshot-portfolio.test.ts`

**Interfaces:**
- Consumes: Task 2 manifest `ContractRef.kind/underlying`.
- Produces: `univ3PositionMath(input: { liquidity, tickCurrent, tickLower, tickUpper, token0, token1 }): { amount0: string, amount1: string }` (concentrated-liquidity amounts; registered in plugins/index.ts as `"univ3-position-math"`); snapshot-portfolio counts `kind: DEBT` asset balances into `liabilities` valued 1:1 via `underlying`'s price, `netWorth = totalValue − liabilitiesValue`; `fetch-positions` `{ documentId, wallet, chainId }` multicalls POSITION/DEBT `balanceOf`s + Uni v3 `getOrder/positions` (NFT ids owned by wallet) → dispatches `SET_POSITIONS` (full replace per wallet+chain).

- [ ] **Step 1: Failing tests** — debt 1:1 valuation math (debtUSDC valued at USDC price); netWorth = assets − liabilities; SET_POSITIONS full-replace per (wallet, chainId); univ3 math golden vectors (symmetric range ≈ proportional, one-sided ≈ zero).
- [ ] **Step 2: Fail. Step 3: MCP enum/op changes + reducers + regen. Step 4: piece actions + gates. Step 5: Commit** `feat: positions and debts as first-class snapshot state`.

### Task 8: Accounting fold + processor

**Files:**
- Create: `processors/accounting-index/{fold.ts,stage.ts,processor.ts,migrations.ts,factory.ts,index.ts}` + `fold.test.ts`, `processor.test.ts`
- Register in `processors/switchboard.ts` (or existing factory registration)

**Interfaces:**
- Consumes: staged ledger events **with** pinned valuations (all wallets), portfolio wallet address set.
- Produces (pure core): `type FoldState = { lots: Map<AssetKey, Lot[]>; realized: RealizedEvent[]; income: Map<IncomeKey, bigint>; months: Map<MonthKey, MonthAgg>; unpriced: UnpricedSummary }`, `fold(state, group: LedgerGroup, ctx: { method: "FCFS"; knownAddresses: Set<string> }): FoldState`; processor tables `lots(wallet, asset, source_event_id, source_seq, quantity, unit_cost)` (ordered), `realized(id, wallet, asset, timestamp, quantity, cost, proceeds, pnl, source_event_id, source_seq, consumed JSON)`, `income(wallet, bucket, month, amount)`, `pnl_month(wallet, month, income, expense, realized_pnl, unpriced_in_count, unpriced_out_count)`; checkpoint row `{ foldVersion, ctxHash, inputHash, state JSON }` — recompute only when `inputHash` changed (full refold per spec §7).
- Semantics (Review Focus 1–3, 5 here): group by `eventIdentifier`, order `(timestamp, eventIdentifier, sequenceIndex)`; paired TRADE legs → acquired lot opens at cost-paid pro-rata; unpaired RECEIVE opens at pinned market; self-transfer (counterparty ∈ knownAddresses, subtype not protocol-semantic) relocates lot at original cost; unmatched spend → `UNPRICED_IN` counter; `ignored` excluded; missing valuation → `UNPRICED_OUT` counter, never zero.

- [ ] **Step 1: Failing property/golden tests** — round-trip swap nets to −fees realized only; self-transfer moves lot, no realized row; conservation Σ lots quantity == ledger net for priced-only fixtures; edit-then-refold == genesis replay of edited input; unpriced counted, report still produced.
- [ ] **Step 2: Fail. Step 3: Implement fold.ts, stage.ts (whole-state diff like portfolio-index), processor.ts (checkpoint memo). Step 4: Gates. Step 5: Commit** `feat(processor): FCFS accounting fold over the ledger`.

### Task 9: portfolio-api subgraph extensions

**Files:**
- Modify: `subgraphs/portfolio-api/{schema.ts,resolvers.ts,lib.ts}` + `lib.test.ts`

**Interfaces:**
- Consumes: Task 8 tables.
- Produces: queries `openLots(wallet?)`, `realizedEvents(from?,to?,wallet?)` (each with `sourceEventId/sourceSeq` + `consumed` lot refs), `incomeByMonth(wallet?)`, `pnlReport(from,to,grouping: MONTH)` (income/expense/realizedPnl/unpricedIn/unpricedOut per bucket+month), `unpricedSummary`.

- [ ] **Step 1: Failing resolver tests** against seeded tables (reuse existing subgraph test harness pattern from `lib.test.ts`). **Step 2: Fail. Step 3: Implement. Step 4: Gates. Step 5: Commit** `feat(subgraph): pnl report queries`.

### Task 10: Views — PnL page, DeFi section, valuation & override UI

**Files:**
- Create: `editors/stackfolio/components/Pnl.tsx`, `editors/stackfolio/components/DeFi.tsx`
- Modify: `editors/stackfolio/{editor.tsx,config.ts,Nav.tsx,lib/gql.ts}`, `editors/wallet-account-editor/{editor.tsx,components/WalletLedger.tsx}`

**Interfaces:**
- Consumes: Task 9 queries; `PIN_VALUATIONS` (manual override dispatch, `source: "MANUAL"`); Task 7 `positions`/`liabilities`.
- Produces: route `pnl` — period selector, income/expense/realized summary by month, realized table (row → source ledger event link, consumed lots expander), open-lots drawer, **unpriced banner** (counts + oldest example) and **out-of-scope banner** naming Hyperliquid accounts (spec §7); Accounts/Assets gain DeFi section (positions by protocol, debts, net worth); WalletLedger shows valuation column with day-rounding mark and a "set price" dialog dispatching MANUAL PIN_VALUATIONS.

- [ ] **Step 1: Wire + build** — follow existing editor component conventions (Booster-less local components as in `Prices.tsx`); `npm run tsc` clean; visual verify via browser on the live drive (screenshots to `docs/screenshots/`).
- [ ] **Step 2: Commit** `feat(editors): pnl page, defi section, valuation overrides`.

### Task 11: Seed the registry document + reconciler + full-history retrofit (live e2e)

**Files:**
- Create: `processors/stackfolio-reconciler/specs.test.ts` additions (`redecode` one-shot spec), `processors/stackfolio-reconciler/specs.ts` (redecode spec: per-wallet re-walk emitting `REPLACE_EVENTS`; runs while `redecodeCursor` behind head, self-completing)
- Modify: `processors/stackfolio-reconciler/{specs.ts,processor.ts,facts.ts}`; wallet-account gains `redecodeCursor: { nextBlock, startBlock } | null` (MCP, like `backfill`)
- Create via MCP: "Protocol registry" document in the Stackfolio drive seeded from Task 2 seeds; live workflows gain `pin-prices` step after import steps; reconciler adds `fetch-positions` on interval.

- [ ] **Step 1: Failing spec tests** — redecode spec shape (trigger, budget, `REPLACE_EVENTS` step wiring); facts include registryDocumentId.
- [ ] **Step 2: Fail. Step 3: Implement reconciler + MCP doc. Step 4: Live e2e** — publish registry to drive; redecode `fr4nk.eth` (known Uni/Aave activity) on live Vetra; verify: semantic rows replaced (`counterparty "aave-v3"` etc.), `ignored` preserved on any reviewed row, prices pinned (daily marks visible), positions show debt/LP where real, PnL page renders months with realized rows and zero unpriced-in for priced assets; screenshot to `docs/screenshots/pnl.png`.
- [ ] **Step 5: Gates + commit** `feat(reconciler): seeded registry, redecode retrofit, pin+positions workflows`.

---

## Execution notes

- Tasks are ordered by hard dependency: 1→2→(3,4 parallelizable)→5→6→7→8→9→10→11. Task 11's live e2e is the acceptance gate for the whole plan.
- Fixture capture (Task 4) needs live indexer calls — do them once, commit the JSON fixtures (they contain only public tx data).
- Spec §9's usage ranking is an after-Task-11 ad-hoc query over indexed rows, not a deliverable; every protocol after the seeds is a manifest-data addition (registry document ops only), which is the design's whole point.
