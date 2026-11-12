# Protocols & Accounting — Design

Date: 2026-11-12 · Status: DRAFT · Approach: A (manifest-driven decoding + fold accounting), chosen over B (per-protocol document models) and C (port rotki's accountant).

## Intent and why

Stackfolio imports chain history (EVM, Bitcoin, Hyperliquid) and shows balances, but smart-contract protocols are opaque: an Aave deposit looks like a USDC spend to a random address, a Sky conversion like a swap, a Uniswap LP like an unexplained NFT. The user wants rotki-grade insight into protocols — Aave, Uniswap, Sky, ENS first, more as usage dictates — **and** accounting on top: cost basis, realized PnL, income.

Rotki solves this with ~100 hand-written decoders and a monolithic imperative accountant whose reports are one-off CSVs computed against live price fetches. We want the same power with three structural advantages rotki lacks: data-driven protocol knowledge, a pure fold instead of an imperative loop, and prices pinned at import time so accounting is deterministic and reproducible.

## Goals

- Semantic ledger rows for known protocols: counterparty (`aave-v3`), subtype (`SUPPLY`, `BORROW`, `LIQUIDATION`, …), replacing the plain transfer rows for decoded transactions.
- Adding a protocol is primarily a **data change** (registry document), not a code deploy; exotic math (Uni v3) is the documented exception via named math plugins.
- Current DeFi positions and debts, including non-tokenized ones (Uni v3 NFTs), as live document state.
- Accounting as a **pure versioned fold** over the ledger producing queryable read models: open lots, realized events linked to their source events, income buckets, per-period aggregates.
- Reproducibility: every PnL number is a function of ledger + pinned prices + settings; no network at fold time; replaying reproduces byte-identical results.
- ENS: owned names on the account, registrations/renewals decoded.

## Non-goals

- Tax filing, jurisdiction-specific rules, or legal correctness. PnL is informational.
- Feature parity with all ~100 rotki protocols. We seed five, extend by usage.
- rotki CSV export compatibility (possible later as a renderer over read models).
- Historical re-pricing of already-pinned rows by new oracle data (manual override only).

## Anti-goals

- A decoder-per-protocol monorepo that grows heavier with each protocol — the rotki failure this design exists to avoid.
- Accounting results nobody can audit: every realized event must link to the ledger event(s) and lot(s) that produced it.
- Silent gaps: missing prices or undecoded protocols must be counted and visible in the UI, never silently zeroed.

## Constraints

- **License**: rotki is AGPL-3.0. Its semantics (which events mean what, which addresses) may be studied and re-encoded as our data/tests; no code copied.
- Powerhouse rules: reducers pure and synchronous; ids/dates/amounts come from action input; never edit `gen/`; model changes go through MCP *and* `src/reducers/`; ≥95% reducer coverage.
- Free API budgets: Etherscan-class 5 req/s, coingecko-class rate limits. Receipt fetching is budgeted per page like existing log scans.
- Existing invariants kept: `IMPORT_EVENTS` dedup by `eventIdentifier-sequenceIndex`, cursor-carrying backfill, workflow-published import steps (reconciler pattern).

## Approach (chosen A) and alternatives

- **A. Manifest-driven decoding + fold accounting.** One generic decode engine + protocol manifests stored in a `stackfolio/protocol-registry` document; accounting is a pure fold in a processor with checkpointed state and subgraph read models. Chosen: each added protocol gets cheaper, accounting is table-testable, results are auditable.
- **B. Per-protocol document models** (`aave-position`, …). Explicit, but 30 protocols × 8 chains of near-identical models; rejected as explosive.
- **C. Port rotki's accountant into one processor.** Fastest to first PnL; inherits the monolith — imperative, DB-shaped, price-fetching during accounting; rejected.

## The design

### 1. Protocol registry (new document model `stackfolio/protocol-registry`)

State: `protocols: ProtocolEntry[]`. Entry:

```ts
{
  id: "aave-v3",                       // counterparty string used in ledger rows
  status: "ACTIVE" | "RETIRED",
  chains: [{
    chainId: 1,
    contracts: [{ name: "pool", address: "0x87870B...", kind: "POOL" }],   // role per protocol
    events: [{
      topic: "0x...",                   // topic0
      name: "Supply",                   // human name
      semantic: { type: "SPEND", subtype: "DEPOSIT_ASSET" } // how matching transfers/logs are tagged
    }],
    plugins?: [{ name: "univ3-position-math", at: "decode" }] // optional pure-function hook
  }],
  notes: null
}
```

Operations: `REGISTER_PROTOCOL`, `UPDATE_PROTOCOL` (full entry replace), `RETIRE_PROTOCOL`. The Stackfolio drive holds one canonical document ("Protocol registry"), seeded with aave-v3, sky, uniswap-v2, uniswap-v3, ens.

Validation is in-repo, not in the document: a generated **topics fixture test** recomputes every `topic` from ABI fragments (viem `encodeEventTopic`) for the entry's named event, so a manifest can't silently point at a wrong hash. Manifest entries whose topics match nothing at scan time are simply inert — a bad entry can't corrupt rows.

### 2. Decode engine (`pieces/ethereum/lib/protocol-decode.ts`)

Pure function: `(manifest-for-chain, account, txReceipts) → { rows, decodedTxHashes }`.

- A tx is a decode candidate if `to`/`from`/log addresses hit a registry contract on that chain, or it contains a Transfer log whose from/to is a registry contract.
- Matching: protocol events (topic0 → `semantic`) set the tx-level meaning; ERC-20 Transfer logs then split into principal legs (tagged with counterparty+subtype) and fee legs (existing FEE handling); anything unmatched keeps the generic row set.
- **Replacement rule**: for a decoded tx, generic transfer rows are dropped and replaced by semantic rows; `eventIdentifier` stays `txid-logIndex`/`txid-n` so IMPORT_EVENTS dedup is unchanged. A tx partially decoded (unknown events alongside known) keeps both sets, protocol-tagged where known.
- Math plugins: pure functions in `pieces/ethereum/lib/plugins/`, keyed by name; manifest references `univ3-position-math` (tick-range principal amounts). Engine calls the registered function if present; unknown plugin name → entry skipped with a warning row count, never a crash.

### 3. Log fetch integration (Etherscan path)

Today `fetch-etherscan-history/recent` build rows from the tx list only. Receipt fetching (§3 cost model, one decision settled): per page, **one** `eth_getLogs`-class query (`logscan` on the indexer; direct `eth_getLogs` on local RPC) filtered to the chain's registry contract addresses over the page's block window → candidate tx hashes; then `eth_getTransactionReceipt` (proxy `proxy` module) **only for hits** — hits are a small fraction of any page, keeping receipt cost proportional to protocol activity, not tx volume. Feed receipts to the decode engine; merge: rows = generic − decoded-tx rows + semantic rows. Candidates are computed per page from the **current** registry document (the action reads it via the reactor context), so publishing a new protocol manifest immediately affects subsequent pages — hot-add without redeploy.

RPC-scan path (`scan-account-logs`) applies the same engine where it encounters registry contracts.

**Retrofit (already-imported history)**: decoding only affects future pages, but every wallet's existing backfill is complete — its whole past would otherwise stay generic. New wallet-account operation `REPLACE_EVENTS { remove: [{id, sequenceIndex}], add: [ImportedEventInput…] }`: removes the named rows, then applies the import path's validation/dedup to the additions, all in one reducer — review overrides (`ignored`, `notes`) from removed rows are carried onto a matching-id addition; `RETYPE_EVENT` edits are overwritten by decode (decoded beats hand-guessed) and counted in the migration report. At registry launch, the reconciler publishes a one-shot `redecode-<wallet>` workflow per wallet: re-walks the backfill window (budgeted like backfill; receipts as above), emits `REPLACE_EVENTS` per page. Idempotent — reruns no-op when rows already semantic.

### 4. Ledger schema extension

`EventType` unchanged (`SPEND/RECEIVE/TRADE/TRANSFER/STAKING/MIGRATE/INFORMATIONAL`). `EventSubtype` extends: existing `DEPOSIT_ASSET`, `WITHDRAWAL` reused for lend supply/withdraw; new `BORROW`, `REPAY`, `LIQUIDATION`, `YIELD`, `LP_MINT`, `LP_BURN`, `NAME_REGISTRATION`, `BRIDGE`. Model change in both places per AGENTS rule (MCP `SET_OPERATION_SCHEMA` + regen; reducers unaffected for pure enum growth). `counterparty` holds the registry id for protocol rows; `counterpartyLabel` (exists) keeps ENS labels.

### 5. Price pinning

`LedgerEvent` and `IMPORT_EVENTS` inputs gain optional `valuation: { unit: "EUR", price: "1234.56", source: "COINGECKO" | "MANUAL" | "UNPRICED", pinnedAt }`. A new workflow step `pin-prices` (piece action; reuses `fetch-prices` internals) batches rows lacking valuations — price at event timestamp, native quote unit from the price book — and dispatches a new operation `PIN_VALUATIONS(events: [{id, sequenceIndex, valuation}])`. Manual override = same operation, `source: MANUAL`; the reducer refuses to overwrite a `MANUAL` valuation with an oracle value. Rows the oracle can't price become `UNPRICED` (explicit, counted, surfaced).

Historical depth: `fetch-prices` today is spot-only; pinning *historical* timestamps is a new capability. v1 = CoinGecko daily close (`/history`, granularity **DAY**) — `valuation` carries `granularity: "DAY"`; sub-daily precision is a later oracle upgrade, not silently pretended at. Pinning the whole past is one call per (asset, day) — a budgeted backfiller with its own cursor, seeded newest-first so recent months price first; assets/days the oracle lacks stay `UNPRICED`.

### 6. Positions and debts

- **Tokenized positions are tokens**: aTokens, cTokens, sUSDS, debt tokens. The asset-registry model's `kind` enum (`ERC20`/`NATIVE` today) extends with `POSITION` and `DEBT`; the protocol entry's `contracts[].kind` tells `import-tokens-to-registry` which tag to apply on registration; `snapshot-portfolio` already sums wallet token balances — positions therefore fall out of existing balance tracking. Debt tokens count as **liabilities**, not negative assets. Snapshot-scoped, matching how every other value lives in this model: `Snapshot` gains `liabilities: [{asset, amount}]` and `netWorth = totalValue − liabilitiesValue`; existing charts/consumers of `Snapshot.totalValue` are untouched. Liabilities are computed by `snapshot-portfolio` from balances of registry assets tagged `kind: DEBT`; a debt token has no oracle of its own — it values **1:1 against its underlying** (aUSDC-debt → USDC price), a mapping carried on the protocol manifest contract entry (`underlying: "…USDC…"`).
- **Non-tokenized**: new action `fetch-positions` per wallet-chain — multicall of manifest `POSITION`/`DEBT` token balances plus, for uniswap-v3, `NonfungiblePositionManager.getPositions` decoded via `univ3-position-math` into underlying amounts. Dispatches `SET_POSITIONS(wallet, positions: [{protocol, kind: "SPOT"|"LP", assets:[{asset, amount}], note}])` onto the portfolio document (idempotent full replace per wallet+chain).
- Views: Accounts/Assets gain a `DeFi` section — positions grouped by protocol, debts and net worth; rotki-parity without a liabilities database.

### 7. Accounting fold (`processors/accounting-index/`)

Processor sharing `portfolio-index`'s substrate (whole-state diff per operation batch — events arrive out of timestamp order, and they stay mutable after import: `PIN_VALUATIONS`, `RETYPE_EVENT`, `SET_EVENT_IGNORED`, `REPLACE_EVENTS`). The pure core:

```ts
fold(state, group: TxGroup, ctx: { method: "FCFS", knownAddresses: AddressSet }) -> state
```

- **Ingestion = full refold of the staged ledger, every batch** (my call for v1). The fold is pure in-memory over ≤ tens of thousands of rows — microseconds; `replay == incremental` holds by construction instead of by test. The checkpoint stores `{ foldVersion, ctxHash, state, inputHash }` purely to skip recompute when the staged input didn't change; any edit or late pin changes `inputHash` → refold. Incremental re-fold from earliest-touched-timestamp is a later optimization gated on measured size, not v1 architecture.
- Input: ledger events **with** pinned valuations, grouped by `eventIdentifier` (one tx), ordered by `(timestamp, eventIdentifier, sequenceIndex)`; ignored rows excluded; no I/O.
- **Lot opening — pairing over spend (not market)**: within a group, `TRADE` legs (and decoded swap pairs) pair SPEND↔RECEIVE: the acquired asset's lot opens at the **cost paid** — FCFS consumption of the spent asset's lots, split pro-rata across multiple acquired legs — never at its own market price (market pricing would book phantom PnL on every swap). Unpaired `RECEIVE`/`YIELD`/`STAKING`/`AIRDROP` opens its lot at pinned market value; unmatched spend quantity (pre-import history) → `UNPRICED_IN`, counted, never fabricated.
- **Self-transfers are not disposals**: `ctx.knownAddresses` = the portfolio's wallet address set (carried in `ctxHash`; snapshot-refresh changes it → refold). A `SPEND` whose counterparty is a known address and whose subtype isn't protocol-semantic moves its lot to the receiving (wallet, asset) **at original cost** — no PnL, no basis reset; fees on it still fold as expense.
- Method: **FCFS first** (my call — the most universally accepted default; HO/ACB become settings variants later). Spend/sell semantics: consume open lots in insertion order.
- State: per (wallet, asset): open lots `[{ eventId, quantity, unitCost }]`, fiat cost basis; realized events `{ sourceEventId, asset, quantity, cost, proceeds, pnl }`; income buckets (data table: subtype → bucket); per (wallet, month) aggregates.
- **Scope**: Bitcoin ledgers are ledger events → in scope like any wallet. **Hyperliquid fills are out of scope for v1** — they live in a separate document, not the ledger; the PnL page shows an explicit out-of-scope banner naming excluded accounts (anti-silent-gap rule), and a second fold input over HL fills is a later add-on.
- Read model + `portfolio-api` subgraph extensions: `openLots`, `realizedEvents`, `incomeByMonth`, `pnlReport(from,to,grouping)`, `unpricedSummary`. No report documents; the truth lives in ledger ops, the report is derived state.
- View: PnL page — period selector, income/expense summary, realized-events table (each row links the source ledger event and consumed lots), open-lots browser, unpriced-items warning banner.

### 8. ENS

Already partially built (`fetch-ens-names` action, labels). Extend: manifest entries for the base registrar/NameWrapper + `.eth` controller decode `NAME_REGISTRATION`/renewal rows (name into `notes`); `fetch-ens-names` verifies **ownership** (forward resolution address == wallet) and writes `ensNames: [{name, owned: boolean}]` onto wallet-account state so Accounts shows "owns frankp.eth".

### 9. Protocol ordering

Seed: aave-v3, sky, uniswap-v2, uniswap-v3, ens. After the log-fetch path is live, a one-off **usage scan** over imported history counts registry-contract hits per protocol for the user's wallets; the "etc" (morpho, curve, pendle, …) is ordered by that count, not by guesswork.

## Testing

- Decode engine: table tests on **captured real receipts** (frankp/fr4nk tx fixtures: aave supply/withdraw+borrow, sky conversion, uni v2 swap, uni v3 mint, ens registration) — golden rows in, golden rows out.
- Fold: property tests — Σ open-lot quantity per asset == quantity implied by ledger; full-refold determinism; **round-trip swap books zero net realized PnL except fees** (pairing correctness); self-transfer carries basis and books no PnL; late `PIN_VALUATIONS`/`RETYPE` change output exactly as a genesis replay does.
- `REPLACE_EVENTS`: review-override carry-over; idempotent rerun; validation reuse.
- Pin: oracle mocked; timestamp-rounding boundaries; MANUAL-overwrite refusal.
- Manifests: topics-fixture test recomputes every topic from ABI fragments.
- Live e2e as per provider precedent: bounded real fetch → real doc → ledger/positions/pnl visibly populated.

## Left to the builder

Exact manifest JSON field names beyond the sketch; fold checkpoint encoding; subgraph schema shape for the report queries; PnL page layout; `UNPRICED` thresholds in UI copy; plugin interface signature beyond name+inputs.

## Open owner questions (answered at approval)

1. **Historical price granularity**: v1 pins at CoinGecko **daily close** granularity. Accept daily-rounded historical valuations (with manual override per row), or should precise-timestamp pricing be a launch requirement (paid oracle key)?
2. **Retrofit budget**: the one-shot re-decode re-walks each wallet's full history (extra indexer calls, days of budgeted work on heavy wallets) and overwrites `RETYPE_EVENT` review edits where decode disagrees. Proceed with full-history retrofit, or decode forward-only and leave old history generic?
