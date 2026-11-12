# Stackfolio Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 Stackfolio package: five crypto-portfolio document models, an `ethereum` piece with reconciler-built import workflows against local Geth/Prysm, a pglite index + subgraph, and portfolio-grade editors, verified end-to-end with `frankp.eth`.

**Architecture:** Sektar's proven shape — documents hold the auditable ledger and curated state; pglite `RelationalDbProcessor` indexes feed a read-only subgraph; editors query the subgraph for lists and dispatch document actions for changes; workflows (built/published as the granting person by a reconciler processor) run `ethereum` piece actions that import chain data idempotently.

**Tech Stack:** Powerhouse stack 6.2.3-dev.96, document-model 6.2.3, React 19, tailwind 4, design-system, viem (RPC + ENS), echarts, PGlite, GraphQL subgraphs, vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-stackfolio-design.md` (read it first; the spec argues the shape, this plan pins the build).

## Global Constraints

- All `@powerhousedao/*` + `document-model` at `6.2.3-dev.96` exactly (package.json pins).
- NEVER edit `gen/`, `.ph/`, `editors/editors.ts`, `processors/factory.ts`, `processors/index.ts`, `processors/switchboard.ts`, `processors/connect.ts`, `subgraphs/index.ts`, `document-models/upgrade-manifests.ts` (codegen-owned).
- Reducers pure + synchronous: ids, timestamps, decimals arrive in action input; `??` never `||`; validate-then-mutate.
- Crypto amounts and fiat values are decimal `String`s (never Float). Addresses lowercase. Timestamps `DateTime` ISO strings.
- Document type ids: `stackfolio/asset-registry`, `stackfolio/portfolio`, `stackfolio/wallet-account`, `stackfolio/eth-staking`, `stackfolio/price-book`. Author name `Stackfolio`, website `https://github.com/froid1911/stackfolio`.
- Native asset identifier: `eip155:1/slip44:60` (CAIP-19 convention). ERC-20: `eip155:1/erc20:0x<checksumless-lowercase-address>`.
- Endpoints default local: RPC `http://127.0.0.1:8545`, beacon `http://127.0.0.1:3500`, chainId 1. CoinGecko (`https://api.coingecko.com/api/v3`) is the only sanctioned external call.
- Chain data is immutable: no pending-state machinery in models.
- Checks after every code task: `npm run tsc` and `npm run lint:fix` clean; `npm run test:coverage` with reducers ≥95% on all four metrics; commit with conventional messages.

## Review Focus

Each line is a failure the spec implies but happy-path tasks won't catch; the owning task pins it with the named test.

1. **Reruns/overlapping windows** must import nothing twice: `IMPORT_EVENTS` rejects a replayed `(eventIdentifier, sequenceIndex)` (`DUPLICATE_EVENT`) and the piece plans only new rows — Tasks 4, 11.
2. **Cursor regression** (replay, concurrent runs, a mis-set backfill) must never rewind scanning: `RECORD_SCAN_PROGRESS` throws `CURSOR_REGRESSION` — Task 4.
3. **Missing price** must render as "unknown" and never contribute a fabricated value to net worth — Task 15 (`price unknown` test).
4. **Ledger that starts mid-history** yields a lower-bound holding; the `estimated` flag must propagate to every view that sums — Tasks 11, 15.
5. **v2-required signing**: a workflow that publishes but parks must surface as a BLOCKING issue via `RECORD_CHECK`, and e2e asserts a scheduled run actually executed — Tasks 12–13, 20.
6. **Oversized getLogs windows**: the piece sub-chunks and never silently truncates past `maxLogs` — Task 7 (`truncation flagged` test).
7. **ENS resolution failure** (no resolver, packed-format surprises) must never fail an import; the label falls back to the address — Task 8.

## Shared: model-task procedure

Tasks 2–6 all follow the same platform flow (skill `powerhouse-document-models`): ensure Vetra is up (first `reactor-mcp` call starts it); `getDocumentModelSchema type:"powerhouse/document-model"`; `createDocument` in the `vetra-<hash>` drive; one `addActions` batch per model (header: `SET_MODEL_NAME`/`SET_MODEL_ID`/`SET_MODEL_EXTENSION`/`SET_MODEL_DESCRIPTION`/`SET_AUTHOR_NAME`/`SET_AUTHOR_WEBSITE`; state: `SET_STATE_SCHEMA`+`SET_INITIAL_STATE`; modules: `ADD_MODULE`, `ADD_OPERATION` {id, schema, reducer}, `ADD_OPERATION_ERROR` per error; ids are uuids you generate and keep in the task notes); `getCodegenStatus waitSeconds:60`; move real reducer bodies into `document-models/<name>/v1/src/reducers/<module>.ts`; tests in `v1/tests/`; `npm run tsc && npm run lint:fix && npm run test:coverage`; commit. Reducer code in `ADD_OPERATION` is the method body only. Tests read rejections via `document.operations.global[i].error`, never `toThrow()`.

---

### Task 1: Foundation wiring

**Files:**
- Modify: `package.json` (deps: `viem@^2.50`, `echarts@^5.6`, `@powerhousedao/workflow@6.2.3-dev.96`, `@powerhousedao/pieces-framework@6.2.3-dev.96`; keep resolutions/overrides tidy)
- Modify: `hosts/switchboard/host.js` (add the workflows plugin block)
- Modify: `powerhouse.config.json` (add `"workflows": { "enabled": true }`)
- Create: `pieces/index.ts` (empty `PackagePiece[]` barrel, grows in Task 7)

**Interfaces:**
- Produces: `powerhouse/workflow` + `powerhouse/connection` models load in the reactor; `workflows` drive served; the package declares `./pieces` export (already in exports map).

- [ ] **Step 1: Add dependencies** to `package.json` dependencies (create the section — the scaffold has only devDependencies; runtime deps of a package go to `dependencies`, peer-safe since consumers are hosts), run `pnpm install`.
- [ ] **Step 2: Add the workflows plugin** to `hosts/switchboard/host.js` `plugins`: copy sektar's block —
  ```js
  {
    module: "@powerhousedao/switchboard/plugins/workflows",
    config: { drive: { slug: "workflows", name: "Workflows", projectHash: false } },
  },
  ```
  (sektar `hosts/switchboard/host.js:22-29`; skip portle and ai plugins).
- [ ] **Step 3: Enable workflows** — `powerhouse.config.json` gets `"workflows": { "enabled": true }`.
- [ ] **Step 4: `pieces/index.ts`** — `import type { PackagePiece } from "@powerhousedao/pieces-framework"; export const pieces: PackagePiece[] = [];`
- [ ] **Step 5: Verify** `npm run tsc` passes. Runtime proof (Workflow Studio present, engine up) lands in Task 20 e2e.
- [ ] **Step 6: Commit** `chore: wire workflow engine, viem and echarts deps`.

### Task 2: `stackfolio/asset-registry` model

**Files:** created by codegen under `document-models/asset-registry/v1/` (+ `src/reducers/registry.ts`, `tests/registry.test.ts`, `tests/scenario.test.ts`).

**Interfaces:**
- Produces: type `stackfolio/asset-registry`; barrel exports `actions`, `utils`, types `AssetRegistryState`, `Asset`.

- [ ] **Step 1: State schema** (global; initial value `{ assets: [] }`):
  ```graphql
  type AssetRegistryState { assets: [Asset!]! }
  type Asset {
    id: OID!
    identifier: String!   # eip155:1/slip44:60 | eip155:1/erc20:0x…
    symbol: String!  name: String!  decimals: Int!
    kind: AssetKind!      # NATIVE | ERC20
    chainId: Int!
    coingeckoId: String   custom: Boolean!  addedAt: DateTime!
  }
  enum AssetKind { NATIVE ERC20 }
  ```
- [ ] **Step 2: Module `registry`** with operations (input types per naming rules — see Shared):
  - `REGISTER_ASSET` — input `{ id: OID!, identifier: String!, symbol: String!, name: String!, decimals: Int!, kind: AssetKind!, chainId: Int!, coingeckoId: String, addedAt: DateTime! }` → pushes with `custom: true`. Errors: `ASSET_EXISTS` (`DuplicateAssetError`).
  - `UPDATE_ASSET` — `{ identifier: String!, symbol: String, name: String, decimals: Int }` (assign with `!= null` guards). Errors: `ASSET_NOT_FOUND` (`AssetNotFoundError`).
  - `SET_COINGECKO_ID` — `{ identifier: String!, coingeckoId: String }`. Errors: `ASSET_NOT_FOUND`.
  - `REMOVE_ASSET` — `{ identifier: String! }`, custom-only. Errors: `ASSET_NOT_FOUND`, `ASSET_NOT_CUSTOM` (`NotCustomAssetError`).
- [ ] **Step 3: Reducers** — per spec; duplicate check on `identifier` (case-exact).
- [ ] **Step 4: Tests** — scenario (register→update→set cg→remove; duplicate rejected at right operation index; remove of non-custom rejected) + one test per error. Coverage ≥95%.
- [ ] **Step 5: Checks + commit** `feat: asset-registry document model`.

### Task 3: `stackfolio/portfolio` model

**Files:** `document-models/portfolio/v1/src/reducers/{identity,addressBook? use folders: identity, addressBook→address-book, pricing, snapshots, reconciler}.ts` (codegen names by module), `tests/`.

**Interfaces:**
- Produces: type `stackfolio/portfolio`; state types `PortfolioState`, `AddressEntry`, `PriceOverride`, `Snapshot`; actions consumed by Tasks 12, 15, 16.

- [ ] **Step 1: State schema** (initial: `{ baseCurrency: "EUR", autoSnapshot: { enabled: false, intervalHours: 24 }, addresses: [], priceOverrides: [], ignoredAssets: [], snapshots: [], resources: null, lastCheck: null, grant: null }`):
  ```graphql
  type PortfolioState {
    name: String
    baseCurrency: String!
    addresses: [AddressEntry!]!
    priceOverrides: [PriceOverride!]!
    ignoredAssets: [String!]!
    autoSnapshot: AutoSnapshot!
    snapshots: [Snapshot!]!
    resources: ManagedResources
    lastCheck: ReconcilerCheck
    grant: GrantInfo
  }
  type AddressEntry { id: OID! address: String! chainId: Int! label: String ensName: String tags: [String!]! ignored: Boolean! addedAt: DateTime! }
  type PriceOverride { asset: String! price: String! setAt: DateTime! }
  type AutoSnapshot { enabled: Boolean! intervalHours: Int! }
  type Snapshot { id: OID! timestamp: DateTime! totalValue: String! perLocation: [LocationValue!]! perAsset: [AssetValue!]! }
  type LocationValue { location: String! value: String! }
  type AssetValue { asset: String! amount: String! value: String! }
  type ManagedResources { connectionId: String workflowIds: [String!]! }
  type ReconcilerCheck { at: DateTime! issues: [ReconcilerIssue!]! fixes: [ReconcilerFix!]! }
  type ReconcilerIssue { code: String! severity: IssueSeverity! message: String! accountId: String }
  type ReconcilerFix { code: String! message: String! at: DateTime! }
  enum IssueSeverity { BLOCKING WARNING }
  type GrantInfo { id: String! name: String grantedAt: DateTime! }
  ```
- [ ] **Step 2: Modules and operations** (spec §portfolio): `identity` — `SET_PORTFOLIO_DETAILS {name: String, baseCurrency: String, autoSnapshotEnabled: Boolean, autoSnapshotIntervalHours: Int}` (baseCurrency validated `^[A-Z]{3}$`, error `INVALID_CURRENCY`/`InvalidCurrencyError`; changing currency is allowed only while `snapshots.length === 0`, error `CURRENCY_LOCKED`/`CurrencyLockedError`).
  `address-book` — `ADD_ADDRESS {id, address, chainId, label, ensName, timestamp}` (lowercase-normalize and dedupe on `address+chainId`; `ADDRESS_KNOWN`/`AddressKnownError`), `UPDATE_ADDRESS {id, label, ensName, tags}`, `REMOVE_ADDRESS {id}` (`ADDRESS_NOT_FOUND`), `SET_ADDRESS_IGNORED {id, ignored}`.
  `pricing` — `SET_PRICE_OVERRIDE {asset, price, setAt}` (upsert, `INVALID_AMOUNT` if price not a decimal string), `REMOVE_PRICE_OVERRIDE {asset}`, `SET_ASSET_IGNORED {asset, ignored}`.
  `snapshots` — `TAKE_SNAPSHOT {id, timestamp, totalValue, perLocation: [LocationValueInput!]!, perAsset: [AssetValueInput!]!}` (`EMPTY_SNAPSHOT`/`SnapshotEmptyError` when both arrays empty; `INVALID_AMOUNT` when any value not decimal), `DELETE_SNAPSHOT {id}`.
  `reconciler` — `RECORD_RESOURCES {connectionId, workflowIds: [String!]!}`, `RECORD_CHECK {at, issues: [IssueInput!]!, fixes: [FixInput!]!}`, `SET_GRANT {id, name, grantedAt}`, `CLEAR_GRANT {_empty: Boolean}`.
- [ ] **Step 3: Tests** — scenario: setup→3 addresses→override→snapshot→delete; currency lock after a snapshot; duplicate address (different chain ok); empty snapshot rejected; reconciler record/overwrite. Coverage ≥95%.
- [ ] **Step 4: Checks + commit** `feat: portfolio document model with reconciler module`.

### Task 4: `stackfolio/wallet-account` model

**Files:** `document-models/wallet-account/v1/src/reducers/{account,feed,review,cursor}.ts`, `tests/{feed,review,cursor,scenario}.test.ts`.

**Interfaces:**
- Produces: type `stackfolio/wallet-account`; `WalletAccountState`, `LedgerEvent`; the ledger Tasks 11, 14, 15, 18 depend on:
  ```graphql
  type LedgerEvent {
    id: OID!  eventIdentifier: String!  sequenceIndex: Int!
    timestamp: DateTime!  type: EventType!  subtype: EventSubtype!
    asset: String!  amount: String!            # decimal, unsigned; direction from type
    counterparty: String  counterpartyLabel: String
    notes: String  ignored: Boolean!  source: EventSource!  importBatch: String
  }
  ```
  plus `cursor: ScanCursor { lastLogsBlock: Int, lastNativeScanBlock: Int, lastEventTimestamp: DateTime, lastRunAt: DateTime }`, `backfill: BackfillState { state: BackfillPhase! startBlock: Int nextBlock: Int }` (`enum BackfillPhase { IDLE LOGS NATIVE DONE }`), `nativeBalance: NativeBalance { amount: String! blockNumber: Int! observedAt: DateTime! }`, `address: String!`, `chainId: Int!`, `label: String`, `ignored: Boolean!`. Events carry `importBatch`. Initial: ledger `[]`, ignored false, both cursors null.
- [ ] **Step 1: Schema** per above plus enums `EventType { SPEND RECEIVE TRADE TRANSFER STAKING MIGRATE INFORMATIONAL }`, `EventSubtype { NONE FEE APPROVE WITHDRAWAL BLOCK_PRODUCTION SPAM AIRDROP DONATE DEPOSIT_ASSET REMOVE_ASSET }`, `EventSource { CHAIN MANUAL }`.
- [ ] **Step 2: Modules** — `account`: `SET_ACCOUNT_DETAILS {address: String, chainId: Int, label: String}`, `SET_IGNORED {ignored: Boolean!}`.
  `feed`: `IMPORT_EVENTS {batchId: String!, importedAt: DateTime!, events: [ImportedEventInput!]!}` — `events: [{id: OID!, eventIdentifier: String!, sequenceIndex: Int!, timestamp: DateTime!, type: EventType!, subtype: EventSubtype!, asset: String!, amount: String!, counterparty: String, notes: String}]`; errors `EMPTY_IMPORT`/`EmptyImportError`, `DUPLICATE_EVENT` (matches existing `(eventIdentifier, sequenceIndex)`, message `Event <id>#<seq> already imported`), `INVALID_AMOUNT` (non-decimal `amount`); appends with `ignored: false, source: "CHAIN", importBatch: batchId`.
  `review`: `SET_EVENT_IGNORED {id, ignored}`, `SET_EVENT_NOTES {id, notes}`, `RETYPE_EVENT {id, type: EventType!, subtype: EventSubtype!}` — all `EVENT_NOT_FOUND`/`EventNotFoundError`; retyped event gets `source` left as-is (manual override recorded by subtype change only).
  `cursor`: `RECORD_SCAN_PROGRESS {lastLogsBlock: Int, lastNativeScanBlock: Int, lastEventTimestamp: DateTime, ranAt: DateTime!}` — each block cursor only ever increases, else `CURSOR_REGRESSION`/`CursorRegressionError` (message names which cursor and both values); `SET_BACKFILL_STATE {state: BackfillPhase!, startBlock: Int, nextBlock: Int}`; `SET_NATIVE_BALANCE {amount: String!, blockNumber: Int!, observedAt: DateTime!}` (observations must not go older: `BALANCE_STALE`/`BalanceStaleError` when `observedAt` ≤ existing).
- [ ] **Step 3: Tests** — scenario (import batch → categorize → ignore → progress → backfill IDLE→NATIVE→DONE); every error incl. `CURSOR_REGRESSION` both directions and the `importBatch` stamp; **Review Focus 1+2** pinned here. Coverage ≥95%.
- [ ] **Step 4: Checks + commit** `feat: wallet-account ledger model`.

### Task 5: `stackfolio/eth-staking` model

**Files:** `document-models/eth-staking/v1/src/reducers/{validators,history}.ts`, `tests/`.

**Interfaces:**
- Produces: type `stackfolio/eth-staking`; `EthStakingState { validators: [Validator!]!, balanceHistory: [BalancePoint!]!, withdrawals: [Withdrawal!]!, cursor: StakeCursor { lastBalanceDay: DateTime, lastWithdrawalBlock: Int } }` with `Validator { index: Int! publicKey: String! withdrawalAddress: String activationTimestamp: Int withdrawableTimestamp: Int exitedTimestamp: Int }`, `BalancePoint { validatorIndex: Int! day: String! balanceGwei: String! }` (day = `YYYY-MM-DD`), `Withdrawal { id: OID! validatorIndex: Int! timestamp: DateTime! amountGwei: String! blockNumber: Int! withdrawalRef: Int! }`.

- [ ] **Step 1: Schema + initial** (`validators: [], balanceHistory: [], withdrawals: []`).
- [ ] **Step 2: Modules** — `validators`: `UPSERT_VALIDATORS { validators: [ValidatorInput!]! }` (replace-by-index upsert; keeps any existing index; error `INVALID_INPUT` if any entry lacks `index`/`publicKey` — express as schema-required instead, then the error covers index collisions with different pubkeys: `VALIDATOR_CONFLICT`/`ValidatorConflictError`).
  `history`: `RECORD_BALANCES { points: [BalancePointInput!]!, ranAt: DateTime! }` idempotent on `(validatorIndex, day)` — same-day re-record replaces the point, older days never deleted; `RECORD_WITHDRAWALS { withdrawals: [WithdrawalInput!]! }` idempotent on `withdrawalRef` (dedupe silently, error `INVALID_AMOUNT` on non-decimal); `RECORD_STAKE_SCAN_PROGRESS {lastBalanceDay: DateTime, lastWithdrawalBlock: Int}` (monotone like Task 4: `CURSOR_REGRESSION`).
- [ ] **Step 3: Tests** — upsert keeps/updates; same-day balance replace; withdrawal dedupe; cursor monotonicity. Coverage ≥95%.
- [ ] **Step 4: Checks + commit** `feat: eth-staking document model`.

### Task 6: `stackfolio/price-book` model

**Files:** `document-models/price-book/v1/src/reducers/prices.ts`, `tests/`.

**Interfaces:**
- Produces: type `stackfolio/price-book`; `PriceBookState { baseCurrency: String!, latest: [LatestPrice!]!, history: [PricePoint!]!, status: FetchStatus }`, `LatestPrice { asset: String! price: String! source: String! fetchedAt: DateTime! }`, `PricePoint { asset: String! hour: DateTime! price: String! source: String! }`, `FetchStatus { lastFetchAt: DateTime lastError: String }`.

- [ ] **Step 1: Schema + initial** (`baseCurrency: "EUR", latest: [], history: [], status: {}`).
- [ ] **Step 2: Module `prices`** — `RECORD_PRICES { baseCurrency: String!, prices: [RecordedPriceInput!]!, hour: DateTime!, fetchedAt: DateTime! }` where `prices: [{asset: String!, price: String!, source: String!}]`: upsert `latest` by asset; append `history` at the given `hour`, replacing an existing `(asset, hour)`; errors `EMPTY_RECORD` (`EmptyRecordError`), `INVALID_AMOUNT`. `SET_BASE_CURRENCY { baseCurrency: String! }` (`INVALID_CURRENCY`). `RECORD_FETCH_ERROR { at: DateTime!, error: String! }`.
- [ ] **Step 3: Tests** — upsert latest, hour-bucket idempotency, fetch error/status, both errors. Coverage ≥95%.
- [ ] **Step 4: Checks + commit** `feat: price-book document model`.

### Task 7: `ethereum` piece core — clients, decode, `scan-account-logs`

**Files:**
- Create: `pieces/ethereum/index.ts` (`createPiece`), modify `pieces/index.ts` (register)
- Create: `pieces/ethereum/lib/types.ts`, `lib/client.ts`, `lib/decode.ts`, `lib/auth.ts`, `lib/logo.ts`
- Create: `pieces/ethereum/lib/actions/scan-account-logs.ts`
- Tests: `pieces/ethereum/lib/decode.test.ts`, `lib/actions/scan-account-logs.test.ts`

**Interfaces:**
- Produces: `EthereumAuth = { rpcUrl: string; beaconUrl: string; chainId: number }` (piece auth props, defaults filled in `client.ts`); `EventRow` (the wire shape `IMPORT_EVENTS` consumes: `{ eventIdentifier, sequenceIndex, timestamp, type, subtype, asset, amount, counterparty, notes }` — decimal-String amounts, `timestamp` ISO); `ScanPage = { rows: EventRow[]; lastBlock: number; tokens: string[]; truncated: boolean }`; piece name `"Ethereum"`, action name `scan-account-logs`.
- Constants in `decode.ts`: `TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"`; `topicForAddress(a) = "0x" + "0".repeat(24) + a.toLowerCase().slice(2)`; `NATIVE_ASSET = "eip155:1/slip44:60"`, `erc20Asset = (chainId, token) => \`eip155:${chainId}/erc20:${token.toLowerCase()}\``; `amountFromData(data) = BigInt(data).toString()`.

- [ ] **Step 1: Failing decode tests** with hand-built viem log fixtures: incoming Transfer (topic1 == account) → `SPEND` on the token with `counterparty = topic-from`, outgoing (topic2) → `RECEIVE` with `topic-to`; `sequenceIndex = logIndex`; amounts decimal from 32-byte data; a `truncated` ScanPage (when the last chunk hit `maxLogs`, re-chunking halves until under, then flags `truncated: true`).
- [ ] **Step 2: Implement `decode.ts`** — `decodeTransferLogs(logs, account, chainId): EventRow[]`, `topicForAddress`, `chunkRange(from, to, maxBlocks): [number, number][]`.
- [ ] **Step 3: Failing action test** — injected `getLogs`/`getBlock` fakes (client factory takes an optional transport override): cursor from the wallet-account doc state (fetched via mocked `context.reactor.get`), getLogs both directions with `topicForAddress`, advance `lastBlock` to the last scanned, `tokens` = distinct token addresses touched.
- [ ] **Step 4: Implement `client.ts`** (`createPublicClient(http({ url: rpcUrl }))`, exported `getClients(auth, overrides?)`) and `auth.ts` (`Property.ShortText` props with defaults, `requireAuth: true`); `scan-account-logs` action (props: `accountDocumentId` ShortText required, `maxBlocks` Number default 500, `maxLogs` Number default 5000 — under geth's caps; `requireReactor: "read"`; runs one bounded page from `cursor.lastLogsBlock + 1`, emits `ScanPage`).
- [ ] **Step 5: Register piece** in `pieces/ethereum/index.ts` + `pieces/index.ts`; verify `npm run tsc`, `npx vitest run pieces`.
- [ ] **Step 6: Commit** `feat(ethereum piece): log scan and transfer decode`.

### Task 8: Native walker, account state, ENS labels

**Files:** Create `pieces/ethereum/lib/actions/scan-native-transactions.ts`, `lib/actions/fetch-account-state.ts`, `lib/actions/fetch-ens-names.ts`, `lib/ens.ts`; tests: `scan-native-transactions.test.ts`, `ens.test.ts`.

**Interfaces:**
- Consumes: Task 7's `EventRow`, `chunkRange`, `NATIVE_ASSET`.
- Produces: `scan-native-transactions` (props `accountDocumentId`, `maxBlocks` default 500, `direction: "BACKFILL"|"HEAD"`; emits `{ rows, nextBlock, done }` walking `[backfill.nextBlock, min(nextBlock+maxBlocks-1, head)]`; **Review Focus 7** lives here for labels; withdrawals: `block.withdrawals[]` (viem `getBlock` field) matching the account emit `type: "STAKING", subtype: "WITHDRAWAL"`, amount gwei→eth decimal at 9→18e).
- `fetch-ens-names` (props `addressesJson: string` — JSON array): reverse-resolve each via local chain (registry `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`, `resolver(node)` then `addr`-style read of `name()` on the resolver; forward-check `resolver(namehash(name))` matches), returns `{ labels: Record<address, string> }`; any per-address failure is skipped silently (**Review Focus 7** test: a reverting resolver returns no label, action still succeeds).
- `fetch-account-state` (props `accountDocumentId`): `{ balance: string, blockNumber: number, nonce: number }` at head.

- [ ] **Step 1: Failing walker test** — fixture blocks (3 blocks, 12 txs, 4 touching the account incl. one self-tx): rows for SPEND (`from==account`) / RECEIVE (`to==account`) native events (one `sequenceIndex` each: 0 = the native move), plus one `SPEND/FEE` row per account-initiated tx (`gasUsed * effectiveGasPrice`), self-transfer → single SPEND + single RECEIVE, `nextBlock` = last walked + 1, `done = nextBlock > head`.
- [ ] **Step 2: Implement walker + fee row** (`ETH` from `gasUsed*effectiveGasPrice/1e18`, 18-decimal string via `formatUnits`).
- [ ] **Step 3: Failing ENS test** (fixture: namehash→resolver→name three-hop; packed-bytes resolver result parsed by taking the last 40 hex chars when `addr`-style bytes come back; failure → `{}` entry omitted) then implement `ens.ts` (pure parse helpers separated from client calls so fixtures are honest) and `fetch-ens-names`.
- [ ] **Step 4: Implement `fetch-account-state`**; run all piece tests + `tsc`.
- [ ] **Step 5: Commit** `feat(ethereum piece): native walker, fees, withdrawals, ENS, head state`.

### Task 9: Token metadata and prices

**Files:** Create `pieces/ethereum/lib/actions/fetch-token-metadata.ts`, `lib/actions/fetch-prices.ts`; tests: `fetch-token-metadata.test.ts`, `fetch-prices.test.ts`.

**Interfaces:**
- Produces: `fetch-token-metadata` (props `tokensJson`, `chainId`: `eth_call` to `symbol()`/`name()`/`decimals()` per token — some tokens omit strings; missing/odd values fall back to `symbol = "TKN-<short>"`, `name` same, `decimals` via permissive retry then `18`, all failures degrade to fallbacks not errors) → `{ tokens: [{ identifier, symbol, name, decimals, kind: "ERC20", chainId }] }`.
- `fetch-prices` (props `assetIdentifiersJson`, `hour` ISO) → `{ prices: [{ asset, price, source: "COINGECKO", hour }], error: string | null }` mapping `eip155:1/erc20:0x…` → `contract_address` and `eip155:1/slip44:60` → `id: "ethereum"`; reads the coingeckoId from the caller-supplied `registryJson` (the workflow's earlier reactor `get` step feeds the registry state), falling back to address lookup; **never** invents a price: unmapped assets appear in `error`, not in `prices`.

- [ ] **Step 1: Failing tests** (metadata: one clean token, one missing `name()`; prices: ethereum maps, unmapped surfaces `error`; hour bucket honored).
- [ ] **Step 2: Implement both actions** (HTTP via viem `custom`/fetch; coingecko base URL `Property.ShortText` default `https://api.coingecko.com/api/v3`).
- [ ] **Step 3: tsc + tests pass; commit** `feat(ethereum piece): token metadata and coingecko prices`.

### Task 10: Beacon staking reads

**Files:** Create `pieces/ethereum/lib/beacon.ts`, `pieces/ethereum/lib/actions/fetch-validators.ts`; test: `fetch-validators.test.ts`.

**Interfaces:**
- Consumes: `EthereumAuth.beaconUrl`.
- Produces: `fetch-validators` (props `indicesJson`: `[number]`; per index `GET /eth/v1/beacon/states/head/validators/{index}` → `{ validators: [{ index, publicKey, withdrawalAddress (from withdrawal_credentials 0x01/0x02-prefixed last 20 bytes; null otherwise), activationTimestamp, withdrawableTimestamp, exitedTimestamp: null-or-set }], balances: [{ validatorIndex, day, balanceGwei }] }` — balances are the **head snapshot recorded today** (history accumulates run-over-run; no back-history exists) with `day = hour prop's date`). Beacon failures: unreachable → action returns `{ error }` and empty arrays.

- [ ] **Step 1: Failing tests** — fixture responses for active/exited validator; withdrawal-credential hex → address extraction (`0x01` + 11 zero bytes + addr, and the 0x02 case); unreachable beacon yields `{error}`, never throws.
- [ ] **Step 2: Implement `beacon.ts`** (`beaconGet(path, baseUrl, fetchImpl)` injectable fetch) + the action.
- [ ] **Step 3: tsc + tests; commit** `feat(ethereum piece): beacon validator reads`.

### Task 11: Import actions, holdings, snapshot — the idempotency core

**Files:** Create `pieces/ethereum/lib/plan.ts`; actions `import-events-to-wallet-account.ts`, `import-tokens-to-registry.ts`, `import-staking-to-doc.ts`, `import-prices-to-book.ts`, `holdings-from-ledger.ts`, `snapshot-portfolio.ts`; tests: `plan.test.ts`, one per action.

**Interfaces:**
- Consumes: Task 4/5/6/2 action shapes via `toGlobalAction`-style dispatches; `EventRow`.
- Produces:
  - `planImport(held: {eventIdentifier: string; sequenceIndex: number}[], incoming: EventRow[]): EventRow[]` — filter-only, no mutation. **Review Focus 1** pinned.
  - `import-events-to-wallet-account` (props `walletDocumentId`, `eventsJson`, `batchId`, `importedAt`, plus optional `scanProgressJson` / `nativeStateJson`): fetch doc, filter, dispatch `IMPORT_EVENTS` (+ `RECORD_SCAN_PROGRESS`/`SET_NATIVE_BALANCE` when the optional payloads carry them) via `context.reactor.execute(id, "main", actions)`; empty plan ⇒ success with `imported: 0`, **no dispatch** (the model rejects empty imports).
  - `import-tokens-to-registry` (props `registryDocumentId`, `tokensJson`, `addedAt`): REGISTER_ASSET per unseen identifier; also ensures the chain native asset exists (id `eip155:<chainId>/slip44:60`, symbol `ETH`), computing ids with `generateId()` from `document-model`.
  - `import-staking-to-doc`, `import-prices-to-book` — same plan-then-dispatch discipline.
  - `holdings-from-ledger` (props `portfolioDocumentId`, `walletDocumentIdsJson`, `priceBookDocumentId`, `asOf?`): sums each wallet ledger per asset (ignoring `ignored` events/assets), joins `latest`/`overrides` for values, **`estimated: true` for an asset whose ledger's earliest event is a RECEIVE/SPEND without a genesis observation** (first-seen flag: ledger min-timestamp > account addedAt is *not* enough — pin: the wallet-account carries `estimated` per asset implicitly via an IMPORT that never saw block 0; compute: `estimated = true` when `backfill.state !== "DONE"`), totals via decimal-string add of `price*amount`; missing price ⇒ row `value: null` (never 0). Returns `{ holdings, totalValue, incomplete: boolean }` as JSON step output. **Review Focus 3+4** pinned.
  - `snapshot-portfolio` (props `portfolioDocumentId`, `holdingsJson`, `snapshotId`, `timestamp`): TAKE_SNAPSHOT from the holdings step's JSON (`totalValue`, `perLocation` grouped by chain label, `perAsset`), skipping `value: null` rows out of `totalValue` and setting `incomplete` through a `notes`… no: `TAKE_SNAPSHOT` carries no incomplete flag — rows with null value are excluded from `totalValue` and the snapshot's existence is honest about what it covered.

- [ ] **Step 1: Failing `plan.test.ts`** — rerun no-ops, overlapping windows add only new keys, order preserved.
- [ ] **Step 2: Implement `plan.ts`** then `import-events-to-wallet-account` with a mocked reactor (`get` returns held state; assert `execute` receives exact action list; held-complete ⇒ zero executes).
- [ ] **Step 3: Failing holdings test** — ledger sums, ignored excluded, missing price ⇒ null value + `incomplete: true`, estimated propagation; snapshot builds TAKE_SNAPSHOT input with null-value rows out of the total. Then implement both.
- [ ] **Step 4: Remaining two import actions** (same pattern, one test each) + register all actions on the piece.
- [ ] **Step 5: tsc + full piece tests; commit** `feat(ethereum piece): idempotent imports, holdings, snapshot`.

### Task 12: Reconciler specs and drift (pure)

**Files:** Create `processors/stackfolio-reconciler/specs.ts`, `drift.ts`, `facts.ts`; tests: `specs.test.ts`, `drift.test.ts`.

**Interfaces:**
- Consumes: `@powerhousedao/workflow/document-models/workflow` actions (`wf.setWorkflowName`, `setTrigger`, `setTriggerConfig`, `addStep`, `addEdge`, `publishWorkflow`, `setManagedBy`, `setPolicy`, `setWorkflowStatus`) — sektar's `workflow-spec.ts` API.
- Produces:
  ```ts
  type StepSpec = { name: string; piece: "ethereum"; action: string; config: Record<string, unknown>; connection?: boolean };
  type WorkflowSpec = { key: string; displayName: string; trigger: { kind: "interval" | "manual"; seconds?: number; formInputs?: string }; steps: StepSpec[] };
  liveScanSpec(walletDocId: string): WorkflowSpec          // interval 300s, steps per spec §workflows (incl. native head step)
  nativeBackfillSpec(walletDocId: string): WorkflowSpec    // interval 300s + auto-stop when backfill DONE
  pricesSpec(): WorkflowSpec                               // interval 3600s
  stakingSpec(autoSnapshotEnabled: boolean): WorkflowSpec  // interval 86400s; when enabled appends holdings-from-ledger → snapshot-portfolio steps (spec §workflows #4)
  buildWorkflow(spec, newId: () => string, now: string): WorkflowAction[]
  workflowDrift(spec, facts: WorkflowFacts, now, newId): Drift
  ```
  Step configs chain prior-step JSON with the workflow runtime's templating exactly as sektar's provider steps do (read `processors/integration-reconciler/providers/gmail.ts` for the syntax before writing).

- [ ] **Step 1: Failing `specs.test.ts`** — `buildWorkflow(liveScanSpec("w1"), …)` emits in order: name, trigger+config, all steps, all edges (linear chain), publish, `setManagedBy`; **Review Focus 5** groundwork: `withPublish(actions, now)` equivalent present so publish carries the grant-time stamp.
- [ ] **Step 2: Implement `facts.ts`** (`readFacts(workflowDoc) → { triggerKind, triggerConfig, steps: [{name, action}], published: boolean, managedBy }` from the published snapshot when set, else draft) and `drift.ts` (sektar's `missingSteps`/`sameJson` semantics: rebuild what's missing; status fixes for parked).
- [ ] **Step 3: Failing `drift.test.ts`** — no drift on identical; missing step appended; trigger interval fixed; unpublished gets publish action; parked (DISABLED) gets the status fix.
- [ ] **Step 4: tsc + tests; commit** `feat(reconciler): workflow specs and drift as pure functions`.

### Task 13: Reconciler processor

**Files:** Create `processors/stackfolio-reconciler/{processor.ts,factory.ts,index.ts}` (index codegen-owned — the processor is created as a `powerhouse/processor` document through MCP first, name `stackfolio-reconciler`, type `relational`? **No**: it manages documents, not tables. It still needs the relational host API to exist per scaffold — follow the sektar reconciler's type choice (check `processors/integration-reconciler/processor.ts` base class) and mirror it); modify nothing in `processors/{factory,switchboard,connect}.ts` (codegen registers it).

**Interfaces:**
- Consumes: Task 12's specs/drift; `powerhouse/workflow` documents created via the sektar reconciler's `io.createWorkflow` helper pattern; portfolio `RECORD_RESOURCES`/`RECORD_CHECK`/grant state.
- Produces: a processor following `stackfolio/portfolio` + `stackfolio/wallet-account`: every pass (debounced 60s on any watched op + 15min timer) — ensure connection doc exists (create `powerhouse/connection` with rpcUrl/beaconUrl/chainId defaults if `resources.connectionId` unset/missing), create/repair per-account `live-scan-*` + shared `prices-hourly` + `staking-daily` + per-account `native-backfill-*` workflows (create when absent — put-back discipline; drift when off-spec), publish as the grant person when `grant` set, then `RECORD_CHECK` with issues: `WORKFLOW_PARKED` (BLOCKING), `RUN_FAILING` (WARNING), `NO_GRANT` (BLOCKING, **Review Focus 5**), `CURSOR_STALE` (WARNING: cursor older than 2 intervals).

- [ ] **Step 1: Create the processor document via MCP** (name, type per sektar, doc types `stackfolio/portfolio` + `stackfolio/wallet-account`, app switchboard, CONFIRMED), wait codegen.
- [ ] **Step 2: Failing `reconcile.test.ts`** — given a portfolio with grant + one wallet-account and zero workflows: emits create+configure actions for exactly 4 workflows (backfill only while `backfill.state !== "DONE"`), records resources; drift case repairs; no grant ⇒ NO_GRANT issue, no publish. Use sektar's processor test harness (mock reactor io).
- [ ] **Step 3: Implement `reconcile.ts` + `processor.ts`/`factory.ts`** (filter to the two types; the pass reads workflow docs through the reactor io layer).
- [ ] **Step 4: Tests + tsc; commit** `feat(reconciler): keep import workflows published and checked`.

### Task 14: `portfolio-index` processor

**Files:** MCP-create then implement `processors/portfolio-index/{processor.ts,factory.ts,migrations.ts,schema.ts,rows.ts,processor.test.ts}`.

**Interfaces:**
- Produces tables (namespace per drive): `events(document_id, event_identifier, sequence_index, timestamp, type, subtype, asset, amount, counterparty, counterparty_label, notes, ignored, source, address, chain_id, label)`, `assets(identifier, symbol, name, decimals, kind, chain_id, coingecko_id, custom)`, `prices_latest(asset, price, source, fetched_at)`, `prices_history(asset, hour, price, source)`, `snapshots(id, timestamp, total_value, per_location_json, per_asset_json)`, `validators(...)`, `withdrawals(...)`, `accounts(document_id, address, chain_id, label, ignored, last_logs_block, last_native_scan_block, last_run_at, backfill_state, native_balance, native_balance_block)`, `check_issues(portfolio_doc, code, severity, message, account_id, at)`.
- Subgraph-facing: nothing exported but the tables; the processor replays on operations exactly like sektar finance-index (`RelationalDbProcessor`, `migrations.ts` `up`, batched inserts, deletion handling per processors reference).

- [ ] **Step 1: MCP processor document** (relational, switchboard, the 5 doc types, CONFIRMED) → codegen scaffold.
- [ ] **Step 2: Write `migrations.ts`** + `schema.ts` via `ph generate migration-file` (write the migration first).
- [ ] **Step 3: Failing `processor.test.ts`** using `createTestRelationalDb`/`runProcessorMigrations`/`operationsWithContext`: replay a wallet-account's IMPORT_EVENTS → `events` rows carry address/chain joined from the same doc; portfolio ADD_ADDRESS → not in events but label join updates on later ops (finance-index join-refresh pattern); document deletion removes rows.
- [ ] **Step 4: Implement `rows.ts` + `processor.ts`** (one row-set per document type; full-state diff like finance-index's `diffTransactions`).
- [ ] **Step 5: Tests + tsc + coverage; commit** `feat(index): portfolio-index processor`.

### Task 15: `stackfolio-portfolio` subgraph

**Files:** MCP-create then implement `subgraphs/stackfolio-portfolio/{schema.ts,resolvers.ts,lib.ts,index.ts}` (name must not collide: `stackfolio-portfolio` is free).

**Interfaces:**
- Consumes: Task 14 tables via the index access pattern (`restrict`-wrapped, sektar finance-index resolvers).
- Produces queries editors consume:
  ```graphql
  dashboard(range: TimeRange!): Dashboard!          # netWorthSeries[[from snapshots]] , holdingsBySource[[stacked totals per location from events×prices]], assetRows
  assetRows: [AssetRow!]!                            # amount = SQL sum over events per asset (ignored events/assets excluded); price = override > latest; value null when no price; pctOfNet; estimated = any owning account's backfill_state != DONE
  eventsPage(address: String, asset: String, types: [EventType!], from: DateTime, to: DateTime, search: String, ignored: Boolean, sort: String, offset: Int!, limit: Int!): EventGroupPage!
  accountsRows: [AccountRow!]!                       # + scan status + check issues join
  stakingRows: StakingBoard!
  priceRows(asset: String!, from: DateTime, to: DateTime): [PriceRow!]!
  snapshotsList: [SnapshotRow!]!
  registryRows: [RegistryRow!]!
  ```
  TimeRange enum `W1 M1 M3 M6 Y1 ALL`.

- [ ] **Step 1: MCP subgraph document** (`stackfolio-portfolio`, CONFIRMED) → codegen.
- [ ] **Step 2: Failing resolver tests** (sektar `finance-index/index.spec.ts` harness): dashboard math with a **missing price ⇒ value null + pct excluded** (**Review Focus 3**), estimated row propagation; eventsPage grouping by `(event_identifier)` with per-group counts and ignored filtering; snapshot series ordering + range filter.
- [ ] **Step 3: Implement schema + resolvers** (SQL built as sektar's `queries.ts`; totals computed in JS with decimal strings via `decimal.js`-free BigInt-scaled arithmetic — small helper in `subgraphs/stackfolio-portfolio/lib.ts`, tested directly).
- [ ] **Step 4: `ph generate subgraph --dir stackfolio-portfolio`** warning-clean; tests + tsc; commit `feat(graphql): portfolio subgraph`.

### Task 16: Drive app, Setup wizard, Accounts

**Files:** MCP-create `powerhouse/app` "Stackfolio" (documentTypes: the five models) → implement `editors/stackfolio/{editor.tsx,config.ts,components/*}`, plus `lib/{setup.ts,graphql.ts,format.ts}` (shared by later view tasks).

**Interfaces:**
- Produces: app id `stackfolio` (set as `vetra.previewDrive.app` in `powerhouse.config.json` + restartVetra note); the drive singleton lookup `getOrCreate(portfolioDocType)` used by Setup; subgraph query hooks (`useDashboard`, `useEventsPage`, …) built on the connect-core query helper sektar's `kit/index-gql.ts` uses — study it before writing; formatters `fmtAmount(decimals?)`, `fmtValue(fiat)` (round-down for values, round-up for amounts; "—" for null).
- Components: `Setup.tsx` (3 steps: create/adopt the 4 singletons + the `powerhouse/connection` doc with rpc/beacon defaults; grant step reusing Connect's sign-in → `SET_GRANT`; add-address form with ENS field that resolves locally via a one-shot viem read in the browser against the configured RPC — failure falls back to plain address, **Review Focus 7** UI twin); `Accounts.tsx` (subgraph `accountsRows`: label/ENS, chain, value, last scan, backfill progress `nextBlock/startBlock→DONE`, health badge from `check_issues`, row actions: scan-now via workflow manual-run REST, ignore); nav shell mirroring the spec's IA (Dashboard, Transactions, Accounts, Staking, Assets, Prices).
- Also in this task: MCP-create the five document editors (`*-editor` docs) as **thin review editors** — the `wallet-account-editor` gets the real event review UI (row actions ignore/notes/retype per the editors skill's `useSelectedWalletAccountDocument` pattern); the other four are toolbar + state views.

- [ ] **Step 1: MCP app + 5 editor documents** (CONFIRMED) → codegen, verify `editors/editors.ts` registers 6 modules.
- [ ] **Step 2: Implement `lib/setup.ts` first with a failing vitest** for the adopt-if-present logic (mock drive contents: all present ⇒ adopt; partial ⇒ create only the missing, dispatch nothing else).
- [ ] **Step 3: Setup wizard UI**, verified in the browser (`browser` tool against `ph vetra` Connect at `powerhouse.config.json`'s studio port): full flow on a fresh drive reaches "ready" state and the four docs exist with correct types.
- [ ] **Step 4: Accounts view + wallet-account editor**; browser-verify with a hand-created wallet doc.
- [ ] **Step 5: Preview-drive wiring** (`powerhouse.config.json` → `vetra.previewDrive.app = "stackfolio"`, `restartVetra`), `tsc`+`lint`, screenshots to `.shots/`, commit `feat(app): setup wizard and accounts`.

### Task 17: Dashboard

**Files:** `editors/stackfolio/components/{Dashboard.tsx,NetWorthChart.tsx,HoldingsBar.tsx,AssetTable.tsx,TimeframeSelector.tsx}`, `lib/chart.ts` (ECharts option builders — pure, tested), `lib/chart.test.ts`, `lib/networth.test.ts`.

**Interfaces:** Consumes Task 15 queries; produces `buildNetWorthOption(points, timeframe)` (time-axis line + gradient area + zoom slider, theme-var colors) and `buildHoldingsOption(rows)` (stacked horizontal bar + legend).

- [ ] **Step 1: Failing `chart.test.ts`** (option shape: series order, time axis, snapshot points) and `networth.test.ts` (delta/% math between window ends, null-value rows excluded and flagged `incomplete`).
- [ ] **Step 2: Implement `chart.ts`** (echarts core import only: `echarts/core` + LineChart/BarChart + necessary components — tree-shaken registration), then `Dashboard.tsx` composing the headline card (net worth + delta + `TimeframeSelector` segmented control), chart, holdings bar + legend, asset table (columns per spec: amount, price, value, % of net; `—` for unknown price; `≈` badge for `estimated`), and the **camera button**: dispatches `TAKE_SNAPSHOT` built client-side from the current `assetRows` (null-value rows excluded from `totalValue`, same rule as the piece's snapshot action).
- [ ] **Step 3: Browser-verify** on a seeded drive (throwaway seed script creating docs + the reconciler's imported rows via the live piece against the local node if synced state permits, else fixture import); screenshot.
- [ ] **Step 4: tsc/lint/tests; commit** `feat(dashboard): net worth, holdings, asset table`.

### Task 18: Transactions ledger view

**Files:** `editors/stackfolio/components/{Transactions.tsx,EventGroupRows.tsx,FilterBar.tsx,csv.ts}`, `lib/csv.test.ts`.

**Interfaces:** Consumes `eventsPage`; row actions dispatch `SET_EVENT_IGNORED` / `SET_EVENT_NOTES` / `RETYPE_EVENT` on the owning wallet-account document (group → doc resolved via the row's `document_id`); URL-synced filter state (`URLSearchParams`, read on mount, push on change).

- [ ] **Step 1: Failing `csv.test.ts`** (BOM + CRLF, quoted fields, decimal strings unquoted-numeric safe — quote money fields).
- [ ] **Step 2: Implement `csv.ts` + Transactions view** (group header rows: date, label, tx short-hash, chain; event rows: type badge, asset+amount, fiat value, counterparty/label; actions cluster; `Export CSV` walks `eventsPage` pages under the current filter), filter bar (account, asset, type, dates, search; chips + clear).
- [ ] **Step 3: Browser-verify** filters round-trip through the URL; CSV downloads and opens; row action persists to the document (reload shows it).
- [ ] **Step 4: tsc/lint/tests; commit** `feat(ledger): transactions view with filters and CSV`.

### Task 19: Staking, Assets, Prices views

**Files:** `editors/stackfolio/components/{Staking.tsx,Assets.tsx,Prices.tsx}`.

**Interfaces:** Consumes `stakingRows`, `registryRows`, `priceRows`; Staking includes the validator-indices input that dispatches `UPSERT_VALIDATORS` (form input: indices or pubkeys) — the piece fills the rest on the next `staking-daily` run; Prices shows latest vs overrides with the portfolio `SET_PRICE_OVERRIDE` form and per-asset history chart (reuse `lib/chart.ts`).

- [ ] **Step 1: Implement Staking** (validator table + lifetime withdrawals + balance step chart), browser-verify with a fixture staking doc.
- [ ] **Step 2: Implement Assets** (registry table, price/value/holdings columns, ignore toggle, coingeckoId editor) and **Prices** (latest grid, override editor with validation, history chart).
- [ ] **Step 3: tsc/lint; browser screenshots; commit** `feat(views): staking, assets, prices`.

### Task 20: End-to-end proof

**Files:** `scripts/e2e-stackfolio.mjs` (throwaway), `.shots/` artifacts (gitignored pattern added), optional seed docs.

**Interfaces:** Consumes everything; produces the acceptance evidence the spec names.

- [ ] **Step 1:** `npm run tsc`, `npm run lint:fix`, `npm run test:coverage` (all green, reducers ≥95 everywhere) — any fixups committed first as `fix:`.
- [ ] **Step 2:** Restart vetra through MCP; fresh drive "Stackfolio"; run the Setup wizard in the browser; add `frankp.eth` (0x5C64…Ae50) with a backfill start block near its first activity (probe with the piece's walker over a few windows first to find it, e.g. binary-probe month starts).
- [ ] **Step 3:** Wait/watch the reconciler: workflows created, published under the grant, **scheduled runs execute** (Workflow Studio runs list shows successes — **Review Focus 5** closes here; a parked workflow is a blocking defect, not a caveat).
- [ ] **Step 4:** Events for frankp.eth appear in Transactions (the wallet is quiet by design — assert against the node directly too: `eth_getLogs`/block walk over the backfilled window must equal what the ledger holds; script compares); native balance observation present.
- [ ] **Step 5:** Prices import (coingecko reachable from this machine; if offline, record the explicit failure path instead and say so — the `RECORD_FETCH_ERROR`/`lastError` UI path proves the honest state); dashboard renders net worth from snapshots after a manual "camera" snapshot; CSV downloads.
- [ ] **Step 6:** Screenshots of all six views (light + dark) into `.shots/`; delete the throwaway script unless it earns a permanent home as `npm run smoke`; final commit `test: end-to-end proof artifacts`; then the whole-branch review (subagent-driven flow).

---

**Execution:** After saving, choose subagent-driven (recommended: 20 tasks, interfaces matter across every boundary, and a shipped mistake in import math is "wrong money" — the cost profile the thorough flow exists for) or native execution.
