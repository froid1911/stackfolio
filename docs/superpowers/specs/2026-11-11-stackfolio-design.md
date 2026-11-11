# Stackfolio — a crypto portfolio Powerhouse package

Status: APPROVED (2026-11-11)
Date: 2026-11-11
Precursors: sektar (architecture), rotki (domain model and views)

## Intent and the why

Stackfolio is a Powerhouse reactor package for tracking a crypto portfolio:
the portfolio's data lives in documents (auditable, CRDT-synced, editable
through operations), transactions are imported from blockchain data through
published **workflows**, and Connect shows rotki-class views — a net-worth
dashboard, an event ledger, balances, staking.

The first daily driver is the owner's own stack: wallet `frankp.eth`
(`0x5C647cA5e2Bc5BD17c40410FcB8003D38879Ae50`) plus their ETH validator, on a
locally synced Geth (`http://127.0.0.1:8545`, snap sync, fully synced) and
Prysm beacon API (`http://127.0.0.1:3500`). The data model is chain-aware so
more chains and accounts can join without schema surgery.

Why documents: the sektar lesson — a portfolio is not a read-only mirror of
the chain. The user categorises, notes, ignores and labels, and that human
layer is the actual product. The chain is a fact source; the documents hold
the ledger *and* the judgment.

## Goals (v1)

1. Five document models covering: portfolio settings + address book +
   snapshots, per-address wallet event ledger, asset registry, price book,
   ETH staking.
2. An `ethereum` piece (JSON-RPC + beacon HTTP, custom piece package) and
   workflows built and kept-correct by a reconciler processor that import
   transactions for a wallet account — live scan and resumable backfill —
   plus staking data and prices.
3. A pglite `portfolio-index` processor and `stackfolio-portfolio` subgraph
   answering dashboard/ledger queries across documents.
4. Editors: `stackfolio` drive app with Dashboard (net-worth chart, holdings
   by source, asset table), Transactions (grouped event ledger, filters,
   CSV), Accounts (address rows + scan status), Staking (validators,
   balances, withdrawals), Assets, Prices.
5. End-to-end demo: fresh vetra, add `frankp.eth`, live import runs, events
   and balances appear, dashboard draws.

## Non-goals (v1, explicit)

- Exchanges, banks, Bitcoin/Solana/Substrate accounts (the event model and
  the `chainId` fields are shaped for them; nothing ships half-wired).
- DeFi protocol decoding beyond native transfers, ERC-20 transfers, gas
  fees and withdrawal-contract events. Unknown contract calls surface as
  the fee + whatever transfers matched; no fake "swap" inference.
- On-chain sending (rotki's `/onchain/send`). Stackfolio observes; it never
  signs.
- Historical native-ETH state queries (`eth_getBalance` at old blocks) — the
  node is snap-sync and pruned. Historical balances derive from the event
  ledger, as rotki's derived balances do.

## Anti-goals

- A portfolio that silently shows wrong money: a missing price is shown as
  unknown, never guessed as zero; a failed import shows as a failed run,
  never as "no transactions".
- CRDT bloat: bulk chain noise (receipts, raw logs, price polling) never
  lands in documents as raw rows — documents hold the *events* ledger and
  curated state; the index holds derived query rows.
- Views that fabricate: every number traces to a document fact or a cached
  observation in the index.

## Constraints

- Powerhouse stack `6.2.3-dev.96` (as pinned in package.json); React 19,
  design-system + tailwind 4; models/editors/processors/subgraphs codegen
  conventions — same versions sektar uses.
- Sektar's proven patterns are the template: `<model>.json` + `v1/gen` +
  hand-written `src/reducers` (MCP-side schemas stay in sync), pglite
  `RelationalDbProcessor` index + subgraph resolvers, `integration`-style
  reconciler building `powerhouse/workflow` documents, pieces package with
  `requireReactor` write actions that fetch-modulate-execute document
  actions.
- Reducers pure and synchronous; ids/timestamps come from action input
  (pieces compute them). 95% coverage threshold on reducers.
- Chain access is local-only by principle; the single documented exception
  is price fetching (no local price oracle exists).
- Never edit `gen/` or `.ph/`. New document models go through MCP against
  the project Vetra, reducers mirrored in `src/reducers/`.

## Approaches considered

### Import pipeline

1. **Workflows + custom `ethereum` piece, built and repaired by a
   reconciler processor** (sektar's distyra + integration-reconciler).
   Chosen. It is what was asked for; cursors live in documents so runs are
   resumable and inspectable; Workflow Studio shows runs and failures; the
   reconciler makes drift (paused workflow, changed cursor) visible as
   integration issues instead of silence.
2. Processor-embedded scanner (folder-sync pattern: a long-running
   processor polls the node itself). Simpler to wire, but the import is
   invisible — no runs, no steps, no manual "scan now", no per-step retry.
   Rejected: the user asked for workflows, and observability is the point.
3. CLI import script into documents via reactor API. Throwaway: no product,
   no UI story. Rejected.

### Prices

1. **CoinGecko (keyless free tier) polled by a workflow into a price-book
   document, with manual overrides in the portfolio document.** Chosen: it
   makes net worth work; overrides cover the API's gaps; everything is
   timestamped and auditable. The network call is the one sanctioned
   exception to local-only.
2. Manual entry only — honest but the flagship dashboard dies without
   prices. Rejected as primary; kept as fallback/override.
3. DEX spot price via the local node — per-chain work, needs archive state.
   Rejected for v1.

### Scope shape

1. **EVM (mainnet first, `chainId`-parameterised) + ETH1/ETH2 staking**,
   one drive = one portfolio. Chosen: completes every promised path
   end-to-end; growth is additive.
2. rotki-wide multi-source model. Rejected: wide and hollow beats nothing,
   but not this year.

## Domain model (rotki → stackfolio)

| rotki | stackfolio |
|---|---|
| `history_events` ledger (group_identifier + sequence_index, type/subtype, asset, amount) | `wallet-account` document `events` — same shape, minus exchange-only types |
| `evm_transactions`, receipts, logs | not stored; the scan piece reads them, emits events; tx metadata rides on the event |
| `blockchain_accounts` + `address_book` + settings + `timed_balances`/`timed_location_data` (snapshots) | `portfolio` document: address book, oracle settings, overrides, snapshots |
| `assets` (global identifiers `eip155:1/erc20:0x…`) | `asset-registry` document, same identifier format |
| price history + oracles + manual price cache | `price-book` document (latest + hourly history) + portfolio overrides |
| `eth2_validators`, balance cache, withdrawals | `eth-staking` document |
| `used_query_ranges` checkpoints | `cursor`/`backfill` fields on the wallet-account document |
| pglite-style query tables | `portfolio-index` processor (pglite) + `stackfolio-portfolio` subgraph |

Event taxonomy: `type` ∈ `SPEND, RECEIVE, TRADE, TRANSFER, STAKING, FEE?
(none — fees are SPEND with subtype FEE), MIGRATE, INFORMATIONAL` (a
pruned subset of rotki's `HistoryEventType`); `subtype` ∈ `NONE, FEE,
APPROVE, WITHDRAWAL, BLOCK_PRODUCTION, SPAM, AIRDROP, DONATE,
DEPOSIT_ASSET, REMOVE_ASSET` (pruned likewise). v1 *emits* SPEND/RECEIVE
(ERC-20 + native), SPEND-FEE (gas), STAKING-WITHDRAWAL, and INFORMATIONAL
for undecoded native txs. The enums carry the wider set because manual
retyping uses it.

## Document models

Type prefix `stackfolio/`. Money/amount strings carry decimal text (never
Float for crypto amounts — Float exists only in sektar's fiat world);
fiat values likewise decimal text. Timestamps are ISO DateTime.

### `stackfolio/asset-registry` (one per drive)

State: `assets: [{ identifier (String!), symbol, name, decimals (Int!),
kind: NATIVE|ERC20, chainId (Int!), coingeckoId, custom (Boolean!),
addedAt }]`

Module `registry`: `REGISTER_ASSET` (error `ASSET_EXISTS`),
`UPDATE_ASSET`, `SET_COINGECKO_ID`, `REMOVE_ASSET` (custom only, error
`ASSET_NOT_CUSTOM`). Importing assets before their events is the piece's
job (documents can't see siblings).

### `stackfolio/portfolio` (one per drive)

State: `name, baseCurrency (String!, default "EUR"),`
`addresses: [{ address (lowercase), chainId, label, ensName, tags [String],
ignored (Boolean), addedAt }],`
`priceOverrides: [{ asset, price, setAt }], ignoredAssets: [String],`
`autoSnapshot: { enabled, intervalHours },`
`snapshots: [{ id (OID), timestamp, totalValue, perLocation: [{ location,
value }], perAsset: [{ asset, amount, value }] }]`

Modules: `identity` (`SET_PORTFOLIO_DETAILS`), `address-book`
(`ADD_ADDRESS` err `ADDRESS_KNOWN`; `UPDATE_ADDRESS`; `REMOVE_ADDRESS`;
`SET_ADDRESS_IGNORED`), `pricing` (`SET_PRICE_OVERRIDE`,
`REMOVE_PRICE_OVERRIDE`, `SET_ASSET_IGNORED`), `snapshots`
(`TAKE_SNAPSHOT` err `EMPTY_SNAPSHOT`; `DELETE_SNAPSHOT`; `IMPORT_SNAPSHOT`
for the scheduled one — same validation), `reconciler` — the sektar lesson
that a reconciler must persist what it manages inside a document, not in
memory: `RECORD_RESOURCES` (managed workflow ids, the connection id),
`RECORD_CHECK` (per-pass issues `[{code, severity, message, accountId?}]`
and fixes, shown in Accounts), `SET_GRANT` / `CLEAR_GRANT` (the person
workflows publish as — see Import pipeline).

### `stackfolio/wallet-account` (one per address × chainId)

State: `address, chainId, label (optional override), ignored,`
`events: [{ id (OID), eventIdentifier (txHash or synthetic key),
sequenceIndex (Int), timestamp, type, subtype, asset, amount (decimal
text, signedness expressed by type), addressCounterparty (the other side),
counterpartyLabel, notes, ignored, source ("CHAIN|MANUAL"), importBatch }]`,
`cursor: { lastLogsBlock, lastNativeScanBlock, lastEventTimestamp,
lastRunAt }`,
`backfill: { state: IDLE|LOGS|NATIVE|DONE, startBlock, nextBlock }`,
`nativeBalance: { amount, blockNumber, observedAt }`

Modules: `account` (`SET_ACCOUNT_DETAILS`, `SET_IGNORED`),
`feed` (`IMPORT_EVENTS` batch; errors `EMPTY_IMPORT`,
`DUPLICATE_EVENT` on `(eventIdentifier, sequenceIndex)`; pending events do
not exist here — chain data is final), `review` (`SET_EVENT_IGNORED`,
`SET_EVENT_NOTES`, `RETYPE_EVENT` err `EVENT_NOT_FOUND`), `cursor`
(`RECORD_SCAN_PROGRESS` — monotone guards: cursor blocks never move
backwards, err `CURSOR_REGRESSION` on regression attempts;
`SET_BACKFILL_STATE`, `SET_NATIVE_BALANCE`).

Event `id` and `eventIdentifier` are computed by the piece from chain
coordinates (`txHash`, `logIndex`), so reruns are naturally no-op and the
reducer's duplicate check is the guard rail.

### `stackfolio/eth-staking` (one per drive)

State: `validators: [{ index (Int!), publicKey, withdrawalAddress,
activationTimestamp, withdrawableTimestamp, exitedTimestamp,
withdrawnSoFar? no — derived from withdrawals }]`,
`balanceHistory: [{ validatorIndex, timestamp (day bucket), balanceGwei
(String), source: "BEACON" }],`
`withdrawals: [{ id (OID), validatorIndex, timestamp, amountGwei, txHash,
withdrawalIndex (Int, chain counter) }],`
`cursor: { lastWithdrawalBlock, lastBalanceDay }`

Modules: `validators` (`UPSERT_VALIDATORS` — user supplies indices or
pubkeys; the piece fills the rest via beacon API; local lookup of a
validator from its withdrawal address needs a full-validator scan, so
indices are the entry point), `history` (`RECORD_BALANCES` idempotent by
`(validatorIndex, day)`; `RECORD_WITHDRAWALS` idempotent by
`(validatorIndex, withdrawalIndex)`; `RECORD_STAKE_SCAN_PROGRESS`).
Withdrawals are also imported by the wallet-account of the withdrawal
address as `STAKING-WITHDRAWAL` SPEND→RECEIVE pair facts (the 0x0100…00
system contract's `Withdrawal(address,uint64)` log, `topic1 = address`);
the staking doc is the validator-perspective twin.

### `stackfolio/price-book` (one per drive)

State: `baseCurrency (String! — kept in step with portfolio by the
reconciler), latest: [{ asset, price, source, fetchedAt }],`
`history: [{ asset, timestamp (hour bucket), price, source }],`
`status: { lastFetchAt, lastError }`

Module `prices`: `RECORD_PRICES` (idempotent on `(asset, hour)`),
`SET_BASE_CURRENCY`, `RECORD_FETCH_ERROR`.

## Import pipeline

### Pieces package `pieces/ethereum` ("Ethereum")

Auth props: `rpcUrl` (default `http://127.0.0.1:8545`), `beaconUrl`
(default `http://127.0.0.1:3500`), `chainId` (default 1). Actions (viem
`createPublicClient`; `requireReactor: "write"` where noted):

- `scan-account-logs` — `eth_getLogs` for `Transfer(address,address,uint256)`
  with `topic1`/`topic2` = account, bounded chunk of blocks (props:
  accountDocumentId, maxBlocks, maxLogs); reads each touched tx
  (`eth_getTransactionByHash`, timestamps via `eth_getBlockByNumber` cache);
  emits decoded ERC-20 SPEND/RECEIVE rows + new cursor + seen token set.
  Snap-sync safe (receipts are full history; only state-at-height is pruned,
  which is never queried).
- `scan-native-transactions` — sequential block walker over
  `[from, from+chunk]` (`eth_getBlockByNumber(true)`), matches
  `tx.from`/`tx.to` to the account; emits native SPEND/RECEIVE + `SPEND-FEE`
  per touched tx (`gasUsed × effectiveGasPrice` from the receipt),
  INFORMATIONAL for undecoded outgoing; emits `nextBlock` for resumable
  backfill. Chunked by design: one workflow step = one bounded page, the
  cursor lives in the document.
- `fetch-account-state` — `eth_getBalance` + `eth_getTransactionCount` at
  head (certified observation), head-block number.
- `fetch-token-metadata` — `symbol()/name()/decimals()` per token.
- `fetch-ens-names` — reverse resolution through the local chain (registry
  + `reverse(node)` + `name()`) for counterparty labels.
- `fetch-validators` (beacon) — validators by index/pubkey, day-bucketed
  balances, `Withdrawal`-event rows via the same log mechanics.
- `fetch-prices` — CoinGecko `simple/price` + `market_chart` hourly points.
- `import-events-to-wallet-account` — fetch doc, filter rows already held,
  dispatch `IMPORT_EVENTS` + `RECORD_SCAN_PROGRESS` + `SET_NATIVE_BALANCE`.
  The distyra `import-to-bank-account` discipline verbatim: rerun = no-op.
- `import-tokens-to-registry` — plan + `REGISTER_ASSET` for unseen tokens.
- `import-staking-to-doc` — validators/balances/withdrawals batch import.
- `import-prices-to-book` — plan + `RECORD_PRICES`.
- `snapshot-portfolio` — reads balances via the index GraphQL through the
  reactor's switchboard URL? No: the piece gets the totals from a prior
  step's JSON output (holdings step) and dispatches `TAKE_SNAPSHOT`.
  A `holdings-from-ledger` step computes balances per asset from the
  wallet-account documents (reactor `find` + `get`) — deterministic sum of
  the event ledger plus certified observations, flagged `estimated` when a
  token's ledger starts mid-history (first-seen amount unknown →
  starting balance is unknown: the sum is a *lower* bound; shown as such).

### Workflows (built and drift-checked by the `stackfolio-reconciler`)

Reconciler processor (pattern: sektar's `integration-reconciler`,
scaled down): watches `portfolio` + `wallet-account` docs; keeps four
workflow specs published:

1. **live-scan-<address>** — trigger: interval (default 5 min), one per
   non-ignored wallet-account: `scan-account-logs →
   scan-native-transactions (head chunk) → fetch-account-state →
   fetch-ens-names → import-events-to-wallet-account`. Steps carry sektar's
   `STEP_RETRY`. The native step is in the live chain on purpose: measured
   against the local node (1035 blocks/s with 16 parallel fetches), walking
   one new 12-second block per run is free, and its absence would leave the
   event ledger silently missing native transfers after backfill ends —
   the "wrong money" anti-goal wearing a happy face.
2. **native-backfill-<address>** — interval trigger + manual, with range
   form: `scan-native-transactions (chunked step) → import-events…`, one
   bounded chunk per run from `backfill.nextBlock`. `backfill=DONE` means
   the walker **caught up to head**; the live workflow's native step then
   continues from the same `lastNativeScanBlock` cursor — backfill and live
   are one continuum, not two mechanisms. Honest cost note (measured):
   walking ~23M blocks is ~6h; a 5M-block window ~80min; from a user-chosen
   start block, resumable; parallelism is per-run, across accounts.
3. **prices-hourly** — trigger: interval 1h: `fetch-prices →
   import-prices-to-book`.
4. **staking-daily** — trigger: interval 24h (+manual):
   `fetch-validators → import-staking-to-doc`; auto-snapshot step when
   `autoSnapshot.enabled`: `holdings-from-ledger → snapshot-portfolio`
   (snapshot totals priced via… the piece reads the price-book document for
   latest prices — documents only, no index reads from pieces).

The reconciler also owns: `portfolio.baseCurrency` ↔ `price-book.baseCurrency`
alignment, and workflow health → issues surfaced in the Accounts view
(sektar's `runtimeIssue` vocabulary: BLOCKING vs WARNING).

**Ownership and provisioning** (who creates what): the drive app's **Setup
view** creates the four singleton documents (`portfolio`, `asset-registry`,
`price-book`, `eth-staking`) when a drive has none — adopt-if-present on
reopen — and creates the `powerhouse/connection` document holding the
piece auth (`rpcUrl`, `beaconUrl`, `chainId`). Adding an address in the
Accounts view creates its `wallet-account` document; the reconciler then
builds its workflows. The reconciler recreates **managed workflows** it
lost (sektar's put-back discipline) and nothing else: it never recreates
user documents, and `REMOVE_ADDRESS` (address book) is final — no
resurrection magic.

**Publish identity**: this repo runs `createSignaturePolicy:
"v2-required"` and sektar's hard-won lesson is that the workflow runtime
parks workflows published without a person behind them. The minimal grant
flow is therefore ported, not "scaled down": the Setup view runs the
grant/sign-in step, the person is recorded in `portfolio` (`SET_GRANT`),
and the reconciler publishes managed workflows under that grant with
sektar's `withPublish`. Failing this check (workflows parked), the fix is
in the grant path — which is why it is explicit in the model, not a
runtime accident.

## Index and subgraph

`portfolio-index` processor (`RelationalDbProcessor`, migrations.ts,
rows.ts — same shape as sektar's finance-index) follows the five types and
maintains: `events` (flattened with document id + account label),
`assets`, `prices_latest`, `prices_history`, `snapshots`, `validators`,
`withdrawals`, `accounts` (cursor/scan-status projection),
`holdings` (per account × asset: derived sum + last observation +
`estimated` flag). The subgraph `stackfolio-portfolio` is read-only
(`restrict` per query): `dashboard(range)` → netWorthSeries from snapshots,
holdingsBySource (location = chain or "staking"), assetRows (join latest
price/override → value, % of net); `eventsPage(filters, sort, page)` →
groups (txHash → events) with counts; `accountsRows` (+ scan status);
`stakingRows`; `assetRowsRegistry`; `priceRows(asset, range)`;
`snapshotsList`; `counts`. Editors query only the subgraph (lists) and
documents (opens, mutations) — the sektar contract.

## Views (editors)

Drive app `stackfolio` (editor module + components, design-system +
tailwind, ECharts for charts; URL-synced filters; CSV export client-side
from the current query). Dark-mode first-class. Information architecture
mirrors rotki:

- **Dashboard** — headline card: net worth + period delta + segmented
  timeframe (`1W, 1M, 3M, 6M, 1Y, All`), ECharts area-line with zoom
  slider fed by snapshots ("camera" button takes one; auto-snapshot toggle);
  holdings-by-source as **stacked bar + legend** (no donut — rotki's call,
  ours too); location tiles; asset table (amount, price, value, % net;
  unknown price renders "—", never 0).
- **Transactions** — the ledger: group header rows (date, tx hash, label,
  chain icon) + event rows (type badge, asset+amount, fiat value,
  counterparty); filters: account, asset, type, date range, text; row
  actions: ignore, note, retype (dispatches to the document); CSV export;
  empty/filter-empty/failure states named like rotki's.
- **Accounts** — address rows (label/ENS, chain, value, asset count, last
  scan, cursor, backfill progress bar, run health); add address with ENS
  field resolved locally; per-row "scan now" runs the workflow manually;
  validators live in **Staking**.
- **Staking** — validator rows (index, pubkey short, status, balance,
  withdrawal address, lifetime withdrawals), per-validator balance chart,
  withdrawals table.
- **Assets** — registry table (symbol, name, decimals, kind, chain,
  coingeckoId, custom), price + value held, ignore toggle.
- **Prices** — latest vs base, override editor, history chart per asset.

Document editors: wallet-account (event review), portfolio (settings +
address book + snapshots table), asset-registry, price-book, eth-staking —
each a focused editor registered by documentType; the drive app carries the
portfolio-wide views.

## Host and wiring changes

- `hosts/switchboard/host.js`: add
  `@powerhousedao/switchboard/plugins/workflows` with its `workflows` drive
  (sektar's block, minus portle/ai), so the engine + Workflow Studio exist.
- `powerhouse.config.json`: `"workflows": { "enabled": true }`.
- `package.json`: add `@powerhousedao/workflow`,
  `@powerhousedao/pieces-framework` (6.2.3-dev.96), `viem`; `pieces/` dir
  + `pieces/index.ts` per the workflow package's shipping doc.
- `processors/switchboard.ts` / `connect.ts`: register reconciler +
  portfolio-index; `editors/editors.ts` regenerates via codegen.

## Verification

- Reducer unit tests per model (the 95% bar), covering: duplicate import,
  cursor monotonicity, currency/base alignment errors, snapshot validation.
- Piece tests against recorded JSON fixtures (viem client injected; no
  network in tests): log-chunk → event mapping, native walker, withdrawal
  decode, coingecko → price rows, idempotent import plans.
- Reconciler tests: specs → actions, drift repair (sektar's pattern).
- Index/subgraph tests: rows projection, dashboard math incl. missing price.
- End-to-end (throwaway script + screenshots): vetra up → Setup wizard
  creates the singletons, the connection and grant → add `frankp.eth` with
  a chosen backfill window → native+log import runs → events visible →
  prices import → dashboard renders → CSV downloads. The fresh-vetra check
  that interval workflows actually **run** (not park) under v2-required
  signing is part of this e2e, not a later surprise.

## Known gaps (accepted for v1, named in the UI where felt)

- Native-ETH history before the backfill start block is unknown (the
  holdings `estimated` flag; backfill closes it progressively).
- Internal/trace transfers (contract-internal ETH moves) are invisible to a
  snap-sync node without trace API; not imported.
- Swap/DeFi semantics: transfers of swap txs are recorded as SPEND/RECEIVE
  pairs with the tx hash as group; no protocol attribution yet.
- Validator lookup by withdrawal address needs an indexer; indices/pubkeys
  are user input.
- L2s beyond mainnet: `chainId`-parameterised pieces make it near-mechanical,
  but only mainnet is wired.

## Left to the builder

Exact pglite table shapes and index pages; component decomposition and CSS
tokens naming (follow sektar's editor conventions); reconciler's drift
vocabulary details; whether live-scan workflows are per-account (default:
yes) or one fan-out workflow; date-bucket choice for price history display;
ECharts wrapper component shape; exact badge taxonomy copy.
