# Stackfolio v1 — "Where is my money" product design

Date: 2026-11-13
Status: approved in conversation (platform A, wedge 1)
Owner: single operator, self-hosted

## Intent
Turn the Stackfolio drive app from a demo dashboard into a product a holder trusts with a real portfolio: answer "where is my money, what is it worth, what can't be valued yet, and how are my validators doing" — with honest coverage instead of zeros and dashes.

## Why now
Sync works end to end (workflows → documents → portfolio-index → portfolio-api). The pages under-use that base: raw quantities, spoofed airdrop tokens mixing with real holdings, unpriced rows shown as "—" inside totals, P&L rendered as €0, staking chart drawn as two slabs.

## Goals
1. Trust: every figure on screen is either valued from a real price or explicitly marked unvalued, with the reason.
2. Location: see holdings by asset, chain, wallet and protocol; drill from total → asset → wallet.
3. Truthful P&L: show coverage and what is missing (cost basis, price at event, transfers), not zeros.
4. Validator behaviour: per-validator balance history, withdrawals, performance deltas and an honest APR estimate from data we already ingest.
5. Product-grade UI: consistent formatting, real charts with axes/tooltips, empty and partial states, no raw identifiers where a symbol exists.

## Non-goals (v1)
- Multi-user, accounts, billing (platform decision: single-operator, self-hosted).
- Tax reports, CSV import of exchange history (wedge 3).
- Beacon attestation/penalty ingestion and alerting (wedge 2; requires new document ops).
- Rebuilding ingestion into new chains.

## Constraints found in the code
- Assets are keyed by CAIP identifier; 277 registered, 272 without `coingeckoId`. Spoofed tickers exist (Cyrillic look-alikes, ASCII duplicates for USDT/DAI/USDC).
- Quantities in `holdings` are already scaled by registry decimals but rendered verbatim; assets missing from the registry render raw units.
- Snapshots: only 3, all within four hours on 2026-11-12; price history has ~a week of points. Historical charts must not imply more history than exists.
- Cost basis: FCFS engine exists; 321 disposals without basis, 548 without value. Many transfers are unpriced and unlinked.
- Staking ingestion: validators, daily balance snapshots, withdrawals. No attestations/penalties.
- Charts: hand-rolled SVG (`lib/charts.tsx`); `Bars` draws 180px slabs at n=2. `echarts` is already a dependency.
- UI data is client-side (GraphQL hooks in `lib/graphql.ts`); no API change needed for v1.

## Approaches considered
1. **Funds-map cockpit (chosen)** — trust-classification + formatting layer in the app, honest partial states, real charts, validator performance from existing data. Ships on today's data.
2. **Validator console first** — beaconcha.in parity. Blocked on new ingestion (attestations, duties, penalties) before any pixel.
3. **Accounting suite first** — tax/reporting depth. The engine exists but importers, reports and review flows don't; longest path to a product screen.

Why 1: it is the question the user asks first, it needs no new ingestion, and its asset-identity and valuation work is a prerequisite for 2 and 3.

## The product (v1)
### Asset trust layer (new, client-side)
`editors/stackfolio/lib/assets.ts`:
- `formatQuantity(raw, decimals)`: trim to ≤6 significant fraction digits, group thousands, never scientific notation.
- `isSpoofed(symbol, name)`: mixed-script/invisible/combining characters, non-ticker characters.
- `priceCoverage(holdings, prices)`: valued vs unpriced assets and their quantities.
- `resolveDisplay(identifier, registry)`: symbol, name, chain label, decimals; falls back to the identifier without pretending.
- Symbol collision detection: one symbol on N contracts → "ambiguous ticker" badge.

Balances page:
- Rows grouped by asset identifier, ordered by value; columns: asset (symbol + name), chain, quantity (formatted), value, share.
- An "Unpriced" section, collapsed by default, listing holdings with no price, each with reason and quantity; excluded from totals and the donut, with a header note "N unpriced holdings excluded".
- Spoof-suspect rows hidden behind "Show suspected spam (N)"; never counted in totals.
- Donut, share and total all derive from the same folded totals (the 12.6M-vs-€261k inconsistency is a bug: the donut must use `total`).
- Row drill-down keeps working: asset detail, account overlay.

Assets page:
- Filters: Valued / Unpriced / Suspected spam / All. Counts on each.
- Verified badge (has CoinGecko id or is native), chain, decimals, and the shared-symbol warning.

Prices page:
- Symbol-first rows (registry resolution), search, source and fetched-at, price in the portfolio currency; unpriced assets summarised above with a link to Assets. No identifier-only tabs.

Dashboard:
- "Total value over time" becomes an ECharts line with axes, tooltips and a "3 snapshots since 12 Nov" caption (no invented history).
- Allocation uses the same totals as Balances; adds "Unpriced holdings: N" and "Price coverage: X% of tracked assets" as explicit context.
- Keep the attention banner; add unpriced exposure to it when >0.

P&L:
- Coverage-first: if realized/income/expense are all zero, render the reason (unpriced disposals, unpriced acquisitions) and the counts, with a short "how to fix" list; no zero-filled month table.
- When data exists: keep the monthly table, mark months with unpriced activity.

Staking:
- Per-validator summary cards: balance now, 7d and 30d delta, estimated APR from balance growth over the observed window (labeled estimate), withdrawals total, status.
- Balances drawn as an ECharts line with axes/tooltips; sparse history says so.
- Withdrawals list unchanged.

Charts:
- New `lib/charts.tsx` primitives on top of `echarts` (Line, Donut, Sparkline) with currency/quantity formatters, axis labels, tooltip, and empty/sparse states. Remove the SVG `Bars` slabs.

## Design decisions (builder can follow)
- Trust classification lives in the app, not the index, for v1: it is presentation policy and can change without migrations. Ingestion fixes (persisting CoinGecko ids, runtime asset list for the price workflow, daily price backfill) are phase 2 data work, listed as follow-ups.
- "Unpriced" is a first-class state: never render 0 or a dash inside a total; show the number of unpriced holdings and their quantity.
- Currency formatting: one helper for fiat (`fmtFiat`) and one for quantities; no ad-hoc `Number().toLocaleString` in pages.
- Charts use `echarts` only; no second charting style.
- Every new pure helper gets a unit test; pages get smoke tests only where a regression is plausible (trust grouping, totals consistency).

## Success criteria
- Balances shows real symbols/names and formatted quantities; totals, shares and donut agree; unpriced holdings are listed separately with a count.
- Suspected spoof tokens never contribute to totals and are hidden by default.
- Dashboard chart renders with axes and tooltips and states how many points exist.
- P&L never shows an all-zero table without the reason and the counts.
- Staking shows a line chart and per-validator performance, not slabs.
- `pnpm tsc`, `oxlint`, and the touched tests pass; the app is verified in the browser over the tailnet URL.

## Risks
- Trust heuristics can hide a legitimate asset: mitigation — the toggle is visible with counts, and the Assets page explains classification.
- Sparse history makes charts look empty: mitigation — caption the observed window and provide a "backfill prices" follow-up.
- Repainting the pages may break detail overlays and command palette links: mitigation — keep the current page/data contract, change rendering only.

## Follow-ups (phase 2+)
- Persist CoinGecko ids and resolve contract → id for registry entries; make the price workflow read assets at run time.
- Daily price history backfill (CoinGecko market_chart) and a daily snapshot step.
- Beacon attestation/duty ingestion, reward/penalty history, alerts.
- Tax reports and exchange/CSV imports (wedge 3).
