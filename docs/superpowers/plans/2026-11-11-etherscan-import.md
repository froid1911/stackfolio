# Etherscan History & Live Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Index each wallet's complete history from block 0 (native ETH, internal value transfers, ERC-20 transfers, gas, approvals) via the Etherscan V2 API, and keep wallets current from Etherscan too; the local node serves validators, ENS and staking only.

**Architecture:** Two new ethereum-piece actions (history walker, live poller) read the Etherscan key from the piece connection's auth props and import through the existing `import-events-to-wallet-account` action, reusing `eventIdentifier = tx.hash` so everything dedupes against the ledger. The reconciler swaps the two per-account workflow specs (backfill, live) to the Etherscan steps, garbage-collects the superseded local-scan workflows, and resets backfill cursors for the genesis restart.

**Tech Stack:** TypeScript, pieces-framework, viem types only (no new deps for HTTP - plain `fetch`), vitest with injected fake fetch, existing pglite index + subgraph + views (no read-model changes: the ledger schema is unchanged).

**Spec:** `docs/superpowers/specs/2026-11-11-stackfolio-design.md` (delta in Task 1), decisions 2026-11-11: key lives in the connection doc's auth (user decision, accepted), approvals import as INFORMATIONAL/APPROVE, Etherscan is the sole chain-data source for portfolio data; validators/ENS/staking keep the local node.

## Global Constraints

- No new npm dependencies; plain `fetch` with injectable `fetchImpl` for tests (pattern: `pieces/ethereum/lib/client.ts`).
- Decimal strings everywhere (wei as string; never Float). Addresses lowercase. Timestamps ISO from the API's unix seconds.
- Amount rounding rules and asset ids unchanged: native `eip155:1/slip44:60`, ERC-20 `eip155:1/erc20:0x<lowercase>`.
- API key NEVER appears in log lines, error messages, generated files, or documents other than the connection doc; tests use `test-key-123`.
- Etherscan V2 base `https://api.etherscan.io/v2/api?chainid=<chainId>`; requests serialized with >=220 ms spacing (free tier 5 req/s); HTTP 429/5xx retried with backoff 2s/8s/32s then surfaced as the action error.
- Imports only blocks <= head-9 (confirmations); reruns are idempotent through `(eventIdentifier, sequenceIndex)`.
- Gates after every task: `npm run tsc && npm run lint && npx vitest run pieces/ethereum processors/stackfolio-reconciler`, then commit.

## Review Focus

1. **Missing or wrong API key**: the history run must fail with one clear error naming `Etherscan` and the fix ("set the key on the ethereum connection"), and the reconciler must record a BLOCKING issue - not silently loop.
2. **Rate limits / 5xx**: a run that exhausts retries leaves the cursor untouched and fails loudly; the next run resumes at the same window - no gaps, no double imports.
3. **Internal-tx duplication**: the internal list repeats the top-level `msg.value` as a trace with empty `traceAddress`; that transfer must be counted exactly once (from the transaction row, not the trace).
4. **Reorgs**: a block that disappears after import must not leave phantom rows beyond what confirmations prevent (head-9), and re-import after reorg must no-op via identifiers.
5. **Endpoint-class unavailability** (free tier may reject `txlistinternal` or approvals with NOTOK): that category skips with a WARNING-flavoured message in the run output while the other categories import normally.

---

### Task 1: Spec delta, README truth, connection auth extension

**Files:**
- Modify: `docs/superpowers/specs/2026-11-11-stackfolio-design.md` (data-source section + non-goals: local chain data for portfolio replaced by Etherscan history/live; local node keeps validators/ENS/staking)
- Modify: `README.md` (the "no third-party RPCs" box section: portfolio chain data comes from the Etherscan API with a user key; validators/ENS/staking stay local)
- Modify: `pieces/ethereum/lib/auth.ts` (add auth props + validation)
- Test: `pieces/ethereum/lib/auth.test.ts` (create if absent)

**Interfaces:**
- Produces: `ethereumAuth` custom-auth props `rpcUrl`, `beaconUrl`, `chainId`, `etherscanApiKey: string | undefined`, `etherscanBaseUrl: string | undefined`; helper exported from `auth.ts`: `etherscanConfig(auth: { etherscanApiKey?: string; etherscanBaseUrl?: string }): { apiKey: string; baseUrl: string }` throwing `Error("Etherscan API key is not set - set it on the ethereum connection (Stackfolio reads it from there)")` when missing, default `baseUrl` `https://api.etherscan.io/v2/api`.

- [ ] **Step 1: Write failing tests** - `etherscanConfig` returns trimmed key + default base URL; throws the exact message above when key undefined/blank; honors a custom `etherscanBaseUrl`.
- [ ] **Step 2: Run `npx vitest run pieces/ethereum/lib/auth` - fail expected.**
- [ ] **Step 3: Implement** - add `Property.ShortText` (or `Property.Password` if the framework exports it; check `node_modules/@powerhousedao/pieces-framework`) props `etherscanApiKey` (required false, `type: "password"` hint if ShortText) and `etherscanBaseUrl` (required false); `etherscanConfig` next to `authProps`. Auth `validate` keeps the RPC probe; additionally, when a key is set, require length >= 16 and reject characters outside `[A-Za-z0-9-]`.
- [ ] **Step 4: Update spec + README text** per Files.
- [ ] **Step 5: Gates + commit** `feat(pieces): Etherscan key and base URL on the ethereum connection`.

### Task 2: Etherscan client

**Files:**
- Create: `pieces/ethereum/lib/etherscan.ts`
- Test: `pieces/ethereum/lib/etherscan.test.ts`

**Interfaces:**
- Consumes: `etherscanConfig` (Task 1).
- Produces in `etherscan.ts`:
  - `type EtherscanRow = Record<string, string | undefined>`
  - `class EtherscanError extends Error { constructor(message: string, readonly category: "auth" | "unavailable" | "transient") }` - `auth` for invalid key, `unavailable` for permanent NOTOK ("Free API key", "not available for your plan"), `transient` for 429/5xx/exhausted retries; `auth`/`unavailable` messages must NEVER contain the key.
  - `createEtherscanClient(opts: { apiKey: string; baseUrl: string; fetchImpl?: typeof fetch; spacingMs?: number })` returning `{ call(params: Record<string, string | number>): Promise<unknown> }` - serializes calls (module-level promise chain per client), sleeps `spacingMs` (default 220) before each call, retries 429/5xx/timeout 3 times with 2s/8s/32s (sleep injected via `opts.sleepFn?` default `ms => new Promise(r => setTimeout(r, ms))`), unwraps `{ status, result, message }`: `status "1"` -> parsed `result`; `status "0"` with result `"Rate limit"` or message containing `rate` -> retry; other `status "0"` -> `EtherscanError` categorized; non-JSON body -> `transient`.
  - `etherscanHeadBlock(client): Promise<number>` via `module=proxy&action=eth_blockNumber` (hex decode).

- [ ] **Step 1: Failing tests** with a scripted fake `fetchImpl` + injected `sleepFn`: success unwrap; invalid-key NOTOK -> `category "auth"`; "not available for your plan" -> `unavailable`; 429 then success -> retries and succeeds; 429 x4 -> `transient`; spacing: fake `fetchImpl` records call order, assert serialization (second call starts only after first resolves); error message never contains the key string.
- [ ] **Step 2: Run to fail, implement `etherscan.ts`**, run to pass.
- [ ] **Step 3: Gates + commit** `feat(pieces): Etherscan V2 client with rate limiting and error classes`.

### Task 3: Row mapper (pure, the taxonomy brain)

**Files:**
- Create: `pieces/ethereum/lib/etherscan-rows.ts`
- Test: `pieces/ethereum/lib/etherscan-rows.ts.test.ts` (colocate pattern used by `decode.test.ts`)

**Interfaces:**
- Consumes: row shapes from Etherscan `txlist`, `txlistinternal`, `tokentx`, token approvals.
- Produces: `mapEtherscanRows(address: string, input: { txs: EtherscanRow[]; internal: EtherscanRow[]; tokentxs: EtherscanRow[]; approvals?: EtherscanRow[] }): { events: ImportedEventShape[] }` where `ImportedEventShape` is exactly what `import-events-to-wallet-account` validates today (`eventIdentifier`, `sequenceIndex`, `timestamp`, `type`, `subtype`, `asset`, `amount`, `counterparty`, `notes?`). Rules (tests pin every line):
  - `txlist`, `value > 0`: SPEND (from === address, counterparty `to`) or RECEIVE; `eventIdentifier: hash`; native asset.
  - `txlist`, sender (`from === address`) AND status `"1"`: extra SPEND/subtype FEE row, amount `gasUsed * gasPrice` (BigInt), same `eventIdentifier`, `notes: "gas"`. Failed txs (`status "0"`): fee row only, no transfer row.
  - `txlist` `value "0"` and no token rows: no transfer row (fee only when sent).
  - `txlistinternal`: skip traces with `traceAddress === "[]"` or empty/absent (the msg.value mirror - Review Focus 3); skip `errValue`/reverted (field `errValue` present and non-empty); else same SPEND/RECEIVE mapping, `eventIdentifier: hash`, notes `"internal"`.
  - `tokentx`: asset `eip155:1/erc20:0x<contractAddress lowercase>`, SPEND when `from === address` else RECEIVE, counterparty the other side, `eventIdentifier: hash`.
  - `approvals`: INFORMATIONAL/APPROVE, `eventIdentifier: hash`, asset from `tokenContractAddress`, `amount` = raw allowance `value`, counterparty `spender`, notes the token symbol.
  - `sequenceIndex` per `eventIdentifier`: rows ordered ETH-tx, fee, internal in API order, tokens, approvals; index 0,1,2... - deterministic across reruns (test asserts two calls map identically).
  - Timestamps: `unixSecondsToIso(String, 3-digit ms padding)` from `timeStamp`.

- [ ] **Step 1: Write the test file** with fixture rows copied from real Etherscan field names (hash, timeStamp, from, to, value, contractAddress, tokenName, tokenSymbol, gasUsed, gasPrice, status, traceAddress, errValue, spender, approval tokens). Pin: normal receive/spend, fee row math (e.g. gasUsed 21000 * gasPrice 20000000000 -> 420000000000000), failed tx -> fee only, internal mirror skipped, internal kept with `notes: "internal"`, tokentx asset id lowercase, approvals INFORMATIONAL, determinism.
- [ ] **Step 2: Run to fail, implement, run to pass.**
- [ ] **Step 3: Gates + commit** `feat(pieces): Etherscan rows to ledger taxonomy with single-count internal handling`.

### Task 4: History action (windowed backfill)

**Files:**
- Create: `pieces/ethereum/lib/actions/fetch-etherscan-history.ts`
- Test: colocated `.test.ts`
- Modify: `pieces/ethereum/index.ts` (register)

**Interfaces:**
- Consumes: `createEtherscanClient`, `etherscanConfig`, `mapEtherscanRows`.
- Produces: action `fetch-etherscan-history` - props: `address: Property.ShortText` (required), `startBlock: Property.Number` (required, window begin), `confirmations: Property.Number` (default 9), `windowBlocks: Property.Number` (default 100_000), `pageSize: Property.Number` (default 10_000; the test seam). Output: `{ rows, nextBlock: number, done: boolean, skippedCategories: string[] }`; `nextBlock` = end+1 of the last fully imported window, `done` when the window start exceeds `head - confirmations`; head via `etherscanHeadBlock`; window `[startBlock, min(startBlock+windowBlocks-1, head-9)]`; categories: `txlist`, `txlistinternal`, `tokentx`, approvals. `EtherscanError category "unavailable"` -> skip that category into `skippedCategories`, continue; `"auth"`/`"transient"` -> rethrow (run FAILED). Also in `etherscan.ts`: `fetchWindow(client, params: { address: string; action: string; startBlock: number; endBlock: number; pageSize?: number }): Promise<EtherscanRow[]>` - asc pages until a short page, capped 50 pages; Task 5 consumes this helper.

- [ ] **Step 1: Failing tests** (fake client injected via an exported `create` seam like other actions): first window maps rows + advances cursor; window past head-9 -> `done`, no HTTP calls beyond head; approvals unavailable -> other rows still returned + `skippedCategories: ["approvals"]`; auth error propagates; pagination follows `page=2` after a full 10k page (use small fake page size seam `pageSize` for the test).
- [ ] **Step 2: Fail -> implement -> pass.**
- [ ] **Step 3: Gates + commit** `feat(pieces): fetch-etherscan-history windowed backfill action`.

### Task 5: Live action (head poller)

**Files:**
- Create: `pieces/ethereum/lib/actions/fetch-etherscan-recent.ts`
- Test: colocated
- Modify: `pieces/ethereum/index.ts`

**Interfaces:**
- Produces: action `fetch-etherscan-recent` - props: `address` (ShortText), `fromBlock: Property.Number` required, `confirmations` (default 9), `balanceAddressJson`? - output `{ rows, balanceWei: string, lastBlock: number, skippedCategories: string[] }`. Calls `txlist`/`txlistinternal`/`tokentx` from `fromBlock` to `head-9` (pages as Task 4's helper - extract shared paged fetch to `etherscan.ts` as `fetchWindow`), plus `module=account&action=balance&tag=latest` for the balance. Same category-error semantics as Task 4.

- [ ] **Step 1: Failing tests**: rows + balance + lastBlock; empty window -> empty rows, balance still fresh; unavailable internal -> `skippedCategories` and other rows intact.
- [ ] **Step 2: Fail -> implement -> pass.**
- [ ] **Step 3: Gates + commit** `feat(pieces): fetch-etherscan-recent live poller action`.

### Task 6: Reconciler - new specs, superseded cleanup, cursor migration

**Files:**
- Modify: `processors/stackfolio-reconciler/specs.ts`
- Modify: `processors/stackfolio-reconciler/reconcile.ts`
- Test: `processors/stackfolio-reconciler/specs.spec.ts` / `reconcile` test files (extend existing)

**Interfaces:**
- Consumes: actions `fetch-etherscan-history`, `fetch-etherscan-recent`, existing `import-events-to-wallet-account` (keeps `backfillNextBlock`, `backfillDone`, `scanProgressJson`, `eventsJson`, wallet doc binding, connection binding from `connectionOf`).
- Produces: spec `backfillSpec` -> steps `walk` = `fetch-etherscan-history` (`startBlock: "{{account.backfill.nextBlock}}"` template per existing convention; confirm exact template source from current spec), `import` = existing action (config keys unchanged, no `scanProgressJson`). Spec `liveSpec` -> steps `poll` = `fetch-etherscan-recent` (`fromBlock: "{{account.cursor.lastNativeScanBlock+1}}"` or the existing template idiom), `import` = existing action with `scanProgressJson: { lastNativeScanBlock: "{{steps.poll.output.lastBlock}}", ranAt: firedAt }` and `balanceJson: "{{steps.poll.output.balanceWei}}"` (check exact prop the import action expects for native balance and use it). Intervals unchanged (backfill 60 s, live 120 s). `stakingSpec`, `pricesSpec`, snapshot chain unchanged (local beacon reads stay).
- Reconcile: when an existing workflow matches neither the new spec keys nor is a spec-built workflow, delete/retire it (verify existing garbage-collection path in reconcile.ts covers workflow docs whose key left the spec; if not, add deletion via the same lifecycle ops used at creation, with a test). Cursor migration: for every non-ignored account whose `backfill.startBlock !== 0` and `state === "DONE"`, dispatch one `SET_BACKFILL_STATE { state: "NATIVE", startBlock: 0, nextBlock: 0 }` (guard: once - skip when `startBlock` already 0).

- [ ] **Step 1: Failing spec tests**: specs produce the new step actions/config; a fake reactor state with an old local-scan workflow + DONE-at-26383540 account yields a retire action + the reset operation; DONE-at-0 account yields no reset.
- [ ] **Step 2: Fail -> implement -> pass** (drift reuses `updateStep`; interval trigger fingerprints unchanged).
- [ ] **Step 3: Gates + commit** `feat(reconciler): etherscan backfill and live specs with cursor migration`.

### Task 7: Live end-to-end on real wallets

**Files:** none (verification only; fix-forward with gates on anything it uncovers)

- [ ] **Step 1:** Rebuild, `restartVetra`, set the user's key on the ethereum connection (UI connector edit or MCP `SET_SECRET_REF` path per what the runtime honors), record a NOTE here when done: key set, never quoted.
- [ ] **Step 2:** Watch `fetch-etherscan-history` runs for `fr4nk.eth`: from block 0, expect its pre-window deposit row (SPAM check: subtype NONE by default), balance consistency `sum(events) == balance` for a wallet whose lifetime is fully covered.
- [ ] **Step 3:** Watch `frankp.eth`: full lifetime rows arrive; existing two `withdrawal-*` ledger rows untouched (assert total grows, those two ids never duplicated); approvals land as INFORMATIONAL if any exist.
- [ ] **Step 4:** Live round: send nothing, verify `lastNativeScanBlock` advances and `Open issues` stays 0; kill the key env (temporarily corrupt it via UI) once -> expect exactly one BLOCKING issue with the Task 1 error wording (Review Focus 1), restore.
- [ ] **Step 5:** Update README screenshots (dashboard/transactions now showing multi-year history), commit `docs: etherscan history screenshots`, push both refs.

---

## Increment: multi-provider import (Etherscan free + Blockscout)

Etherscan's free tier does not cover every chain (OP Mainnet, Gnosis,
Base, BSC, Avalanche are paid there). Blockscout's hosted gateway
(`https://api.blockscout.com/{chainid}/api/v2`) with the user's key
answers OP (10) and Gnosis (100) that Etherscan charges for; BSC and
Avax are not Blockscout chains; Base is plan-gated on both - honest
"unsupported", not a silent gap.

Verified live (this key, this hour): gateway OK on 1, 10, 100, 42161,
480, 130, 42220, 11155111; plan-gated 137/8453/324; unsupported 56,
43114, 59144, 146, 999, 5000, 534, 80094, 252, 167000.
API v2 shape: newest-first cursor pages (`next_page_params` echoed
back as query params); NO block or date filters (start_block,
filter_by_date_* silently ignored) - so Blockscout backfill is a
descending crawl inside the walk budget, re-importing what it re-sees
(hash-keyed import makes that cheap and correct), `done` when the last
page is reached. Live poll = crawl until below the cursor block.

### Task 8: Blockscout provider

**Files:** `pieces/ethereum/lib/blockscout.ts` (client: cursor pages,
gate per key, BlockscoutError), `providers.ts` (chain -> provider
table + honest message for unsupported), `blockscout-rows.ts` (items
-> LedgerEventRow, chain-scoped ids), `actions/fetch-blockscout-history.ts`,
`actions/fetch-blockscout-recent.ts`, `auth.ts` (+`blockscoutApiKey`
property), `actions/import-tokens-to-registry.ts` (natives: OP=ETH,
Gnosis=xDAI), specs/reconcile (per-wallet provider choice, step names
from the table), `processors/stackfolio-reconciler` tests.

- [ ] Step 1: providers.ts table + tests (free-etherscan chains, the
      two blockscout chains, null + message for Base/BSC/Avax).
- [ ] Step 2: blockscout.ts client + tests (cursor pagination, 429
      transient, key-gate shared, error categories).
- [ ] Step 3: blockscout-rows.ts + tests (same taxonomy as etherscan-
      rows: value, fee, internal, erc20 transfers; error txs).
- [ ] Step 4: history + recent actions + tests (descending crawl,
      budget, cursor semantics, done at last page).
- [ ] Step 5: auth property + natives table; reconciler picks the
      provider's action names per wallet chainId; drift repair follows
      the same specs.
- [ ] Step 6: gates; set `blockscoutApiKey` on the bound connection;
      create an OP or Gnosis wallet live and watch its rows.
