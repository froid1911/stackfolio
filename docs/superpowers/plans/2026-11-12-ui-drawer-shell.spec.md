# Stackfolio UI/UX restructure — spec

Date: 2026-11-12 · Precursor studied: rotki frontend (`frontend/app/src`)
Decisions (user): full drawer shell · round-one scope: Balances, History,
detail overlays, Address Book, search palette · address book extends
`stackfolio/portfolio` (ops already exist: Add/Update/Remove/Ignore address).

## Why

Rotki separates the three questions a portfolio answers, and so does its
navigation: **state** (Balances: what do I hold now), **events** (History:
what happened), **administration** (Manage X: the reference data). Our flat
8-tab strip mixes them, has no home for "what do I hold", dead-ends on every
row click, and its reference-data tabs are bare listings.

## Target structure (drawer, sections mirroring rotki)

| Section | Entries | Source |
|---|---|---|
| Overview | Dashboard · **Balances** · History (Events, Data issues) · P&L · Staking | dashboard, new balances, transactions+issues, pnl, staking |
| Manage | **Address book** · Assets · Prices · DeFi | new, assets, prices, DeFi (out of Accounts) |
| Portfolio drive | Files · Node | existing Files; staking's node status |
| Footer | Settings → open document editors | — |

Drawer is collapsible (rail at narrow widths), active entry derived from the
route, entries declared data-driven like rotki's `use-navigation-menu.ts`
(one table: id, label, icon, section, order).

## Routing

- Project Connect routes (`hosts/connect/routes/`), file-based TanStack
  Router, under `_app/` so Connect's chrome stays:
  - `/_app/stackfolio/$driveSlug/index` → dashboard (default tab today)
  - `/_app/stackfolio/$driveSlug/$page` → balances | history | pnl |
    staking | address-book | assets | prices | defi | files
  - `/$page/$detail` for overlays: `history/<eventId>`, `balances/<asset>`
    (detail as nested segment → Back works, deep links work)
- Drive resolved via `useDriveRouteData()` from `@powerhousedao/connect-core`
  (`@tanstack/react-router` 1.170.41 already a dev dependency).
- Existing drive app (`editors/stackfolio`) keeps: the setup wizard when the
  drive's singletons are missing (redirect from the Connect route), document
  editors via `children`, and Files. Its tab shell (`Nav.tsx`) is deleted in
  the cutover; `?tab=` links die with it.
- Package routes may import only connect-core/reactor-browser/design-system
  (skill rule) — stackfolio components move to a shared folder importable
  by both hosts and editors.

## Round-one deliverables

1. **Drawer shell** + route files + section structure above; URL-synced
   active state; wizard gate preserved.
2. **Balances** (new): holdings matrix asset × account (values from the
   accounting/portfolio index), totals row, allocation donut, per-asset
   sparkline; row → asset detail; account column → wallet drill.
3. **History**: events table + **Data issues** sub-tab (issues data exists:
   `useIssues`, currently only a dashboard count); **CSV export** of the
   filtered page and of the full filtered set; row → event detail drawer.
4. **Detail overlays**: event drawer (full event, valuation, counterparties,
   link to P&L context); asset detail (price history chart, holdings,
   overrides entry point).
5. **Address book**: table of portfolio addresses (label, address, chain,
   ignored, total) with add/edit/ignore/remove wired to the existing
   portfolio ops via dispatched actions; search.
6. **Search palette** (Ctrl+K): accounts, assets, events (by tx hash),
   navigation jump.

## Explicitly deferred

Design-system component sweep (user excluded); manual balances; calendar;
NFTs; CEX accounts; send/onchain; premium/auth; snapshots browser; tag
manager (tags = portfolio-doc concern later).

## Checks

`npm run tsc`, `npm run lint:fix`, `npx vitest run` (component/lib tests),
`ph build` (route tree), visual pass on `connectUrl` (localhost:2844).
