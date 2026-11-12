# Stackfolio UI/UX Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stackfolio's flat 8-tab drive app with a rotki-style drawer shell built on project Connect routes, and ship round-one views: Balances matrix, History with Data-issues sub-tab + CSV export, event/asset detail overlays, editable Address Book, and a Ctrl+K search palette.

**Architecture:** Views move from the drive app into TanStack file routes under `hosts/connect/routes/_app/stackfolio/$driveSlug/`, so each view owns a URL segment (`/d/<drive>/balances`, `/d/<drive>/history/<eventId>`); Back and deep links are native. The drive app shrinks to its duties that Connect cannot route: the setup wizard, document editors (`children`), and Files. Shared view code lives in `editors/stackfolio/` and is imported by the routes with `../../../../../editors/...` paths (package-import rules make this safe).

**Tech Stack:** React 19, TanStack Router 1.170.41 (project copy, peer), `@powerhousedao/connect-core` router exports, `@powerhousedao/reactor-browser` hooks, Kysely-backed switchboard GraphQL (`portfolioApi`), vitest + jsdom (configured, no setup file → tests use explicit imports, no `@testing-library/jest-dom` matchers).

**Spec:** `local://stackfolio-ui-spec.md`

## Global Constraints

- **Feature branches only** (personal AGENTS.md): work starts with `git checkout -b feat/ui-drawer-shell` off `main`; NEVER commit to `main` directly.
- **Subgraph/processor documents are codegen-gated**: any change under `subgraphs/` or `processors/` is made on the source document via MCP (`addActions`, batched), `getCodegenStatus` settled before editing generated folders; NEVER edit `gen/` or generated `switchboard.ts` directly; the DRAFT→CONFIRMED re-register trick from earlier tasks applies.
- Package routes NEVER import `@powerhousedao/connect` (skill rule; tsc + lint fail): only `@powerhousedao/connect-core`, `@tanstack/react-router`, `@powerhousedao/reactor-browser`, `@powerhousedao/design-system`, and this package's code.
- `@tanstack/react-router` stays exactly `1.170.41` (dev dep); NEVER add another version.
- NEVER edit `gen/`, `.ph/`; `hosts/connect/routes/` is project-owned, `.ph/connect-routes.gen.ts` is generated.
- Drive-app `children` (open document editors) ALWAYS own the screen — unchanged from today's `if (children) return …`.
- Wizard gate unchanged: `planSetup(...).ready === false` → drive shows Setup, every stackfolio route redirects to the drive root.
- Money/quantity values are exact decimal **strings** end-to-end; formatting only in `lib/format.ts` (`fmtFiat`, `fmtQty`-style); no `Number()` arithmetic on values.
- Checks after every task: `npm run tsc && npm run lint:fix && npx vitest run`. Route-tree tasks additionally: `npx ph-cli connect build`.
- Commit per task (message prefixes: feat/fix/refactor(scope)).
- Nav entries are a single data table (`NAV_ENTRIES`) — components derive from it; no view hardcodes a nav label.

## Review Focus

- Slug-vs-id: routes address documents by **slug** (canonical form of opaque ids); a hand-typed hex id or stale slug must land somewhere sane, not blank the page. Test in Task 2 (`resolveNodeSlug`) and Task 10.
- Unknown page/detail segments: `/d/x/balances` with no portfolio singleton, or a detail id that doesn't resolve → the view names the miss ("No such event") and offers Back; never a console crash. Tests in Tasks 11–13.
- CSV injection: a ledger note beginning `=`, `+`, `-`, `@` exports as text-prefixed, not executable. Task 7.
- Stale detail: deleting the open document (event's wallet gone) → overlay closes on the next data arrival instead of rendering `undefined`. Task 13.
- Empty/absent index: every new view renders its empty state when the GraphQL query errors or returns nothing (wizard-fresh drive), matching `EmptyState.tsx` idiom. Tasks 8–12.

## File Structure

```
hosts/connect/routes/_app/stackfolio/$driveSlug/
  index.tsx                 # → /d/:driveSlug            redirect dashboard
  $page.tsx                 # → /d/:driveSlug/:page       page shell: wizard gate, drawer, view switch
  -$detail.tsx              # → nested optional segment   /history/<eventId>, /assets/<slug>
editors/stackfolio/
  nav.ts                    # NAV_ENTRIES data table + page guards (pure, tested)
  components/Shell.tsx      # drawer + header + content grid (replaces Nav.tsx usage)
  components/Balances.tsx   # holdings matrix view
  components/EventDetail.tsx
  components/AssetDetail.tsx
  components/AddressBookView.tsx
  components/CommandPalette.tsx
  lib/slugs.ts              # slug <-> id (pure)
  lib/csv.ts                # escape/toCsv (pure)
  lib/search.ts             # palette candidate builder (pure, injectable queries)
  lib/mutations.ts          # portfolio address ops via useDocumentSafe + dispatch
editors/stackfolio/lib/graphql.ts   # + useEventsByIds, + useHoldingBalances
editors/stackfolio/editor.tsx       # wizard + children + files-mode fallback (tabs removed)
```

Route file ids MUST match paths exactly (`createFileRoute("/_app/stackfolio/$driveSlug/$page")`).

---

### Task 1: Route tree, page guard, and the drawer shell

**Files:**
- Create: `hosts/connect/routes/_app/stackfolio/$driveSlug/index.tsx`
- Create: `hosts/connect/routes/_app/stackfolio/$driveSlug/$page.tsx`
- Create: `editors/stackfolio/nav.ts`
- Create: `editors/stackfolio/components/Shell.tsx`
- Test: `editors/stackfolio/nav.test.ts`

**Interfaces:**
- Produces: `Page` (union type), `isPage(v: unknown): v is Page`, `NAV_ENTRIES: readonly NavEntry[]`, `NavEntry = { page: Page; label: string; section: "Overview" | "Manage" | "Portfolio"; order: number }`, `Shell({ driveName, active, onNavigate, onSearchOpen, onOpenFiles, children }: ShellProps)`; route files for `/_app/stackfolio/$driveSlug` (index) and `/_app/stackfolio/$driveSlug/$page`.
- Consumes: `useSelectedDrive()`, `useNodesInSelectedDrive()`, `getDriveName` (reactor-browser); `planSetup` from `lib/setup.ts`; `useSetSearchParams`, `useSearchParams`.

- [ ] **Step 1: Failing test** — in `editors/stackfolio/nav.test.ts`: `isPage("balances")` true; `isPage("nonsense")`, `isPage(7)`, `isPage(undefined)` false; `NAV_ENTRIES` pages are unique; `NAV_ENTRIES.filter(e => e.section === "Overview").map(e => e.page)` equals `["dashboard","balances","history","pnl","staking"]`; Manage equals `["address-book","assets","prices","defi"]`.
- [ ] **Step 2: Run** `npx vitest run editors/stackfolio/nav.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `nav.ts` — `export type Page = "dashboard" | "balances" | "history" | "pnl" | "staking" | "address-book" | "assets" | "prices" | "defi";` data table with the sections/orders above; pure guard. Dashboard keeps its today-semantics: portfolio overview (`Dashboard.tsx`, reads `useTotals`/`useSnapshots`).
- [ ] **Step 4: Run test** → PASS.
- [ ] **Step 5: Shell.tsx** — left drawer (`w-56`, groups from `NAV_ENTRIES` by section, collapsed to a 12-unit icon rail under `md:` via Tailwind), header with drive name + Files button + Search button (calls `onSearchOpen`), content region `<main className="min-h-0 flex-1 overflow-y-auto">`. Active entry: `active === e.page`. No external icon dependency yet: one-letter/inline-SVG glyphs inline; keep a `glyph` field in the entry data so icons stay data.
- [ ] **Step 6: Route files.** `$page.tsx`:
  ```tsx
  export const Route = createFileRoute("/_app/stackfolio/$driveSlug/$page")({
    validateSearch: (s: Record<string, unknown>) => ({
      detail: typeof s.detail === "string" ? s.detail : undefined,
    }),
    component: PageRoute,
  });
  ```
  `PageRoute` mirrors the app-root pattern it replaces (read: `editors/stackfolio/editor.tsx:56-101`): `useSelectedDrive()` — when the selected drive's slug ≠ `$driveSlug`, call `useSetSelectedDrive()` once in an effect; `planSetup(nodes, typeOf)`; `!plan.ready` → `<Setup onReady={…}/>` full-screen (same wizard as today, redirect to index route on ready); else `<Shell …>` + `switch (page)`: existing view components (Tasks 2–13 fill `balances`, `address-book`, overlays; for now reuse `DashboardSection`/`TransactionsSection`/`PnlSection`/`StakingSection`/`AssetsSection`/`PricesSection` — lift these section wrappers out of `editor.tsx` into `components/sections.tsx` unchanged). Index route: redirect `to: "/_app/stackfolio/$driveSlug/$page"` params `{ page: "dashboard" }`.
- [ ] **Step 7: Route tree check** — `npx ph-cli connect build` exits 0 and `.ph/connect-routes.gen.ts` lists both new routes (do not edit it).
- [ ] **Step 8: tsc/lint/vitest** → clean.
- [ ] **Step 9: Commit** `feat(connect): drawer-shell routes for the portfolio drive`

### Task 2: Slug codec + canonical URL slugs

**Files:**
- Create: `editors/stackfolio/lib/slugs.ts`
- Test: `editors/stackfolio/lib/slugs.test.ts`
- Modify: `hosts/connect/routes/_app/stackfolio/$driveSlug/$page.tsx` (canonicalize unknown ids in effect)

**Interfaces:**
- Produces: `slug(id: string): string` (lowercase hex form), `normalizeSlug(value: string): string` (strip case/dashes, hex-only), `resolveNodeSlug(nodes: { id: string }[], candidate: string): string | undefined` (match normalized against node ids).

- [ ] **Step 1: Failing tests** — `slug("sB90IcnFT_tch…") !== slug(id)` (base64 url-safe → hex changes nothing for hex ids; assert idempotence `slug(slug(x)) === slug(x)`), `normalizeSlug("0X12Ab-12") === "12ab12"`, `resolveNodeSlug([{id:"aB1"}], "ab1") === "aB1"`, unknown → `undefined`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** pure codec. Detail ids use `slug(eventId)`; ids containing non-alphanumerics (`0x…:log:3`, uuid docs) round-trip by prefix-preserving transform documented in the function header; decode NEVER required (views match by normalized compare, like `resolveNodeSlug`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: In `$page.tsx`**: effect — when `page`/`detail` param doesn't match a resolvable canonical form, `useNavigate({ replace: true })` to the canonical URL. Test: route-render with `detail="0XAA:0"` (msw-stubbed query or stub hook injection) navigates replace to `detail="aa-0"` — or, if render-testing routes is impractical in vitest+jsdom, export the pure `canonicalize({ page, detail, nodes })` from the route file's module and unit-test it in `nav.test.ts` style; the route effect calls it and never inlines URL logic.
- [ ] **Step 6: tsc/lint/vitest → commit** `feat(connect): canonical slugs for portfolio route params`

### Task 3: Portfolio address mutations

**Files:**
- Create: `editors/stackfolio/lib/mutations.ts`
- Test: `editors/stackfolio/lib/mutations.test.ts` (pure input-builders only; dispatch itself is exercised live in Task 12)
- Modify: `editors/stackfolio/lib/setup.ts` if `portfolioNodeId` helper should be shared (move from `editor.tsx` local there — it's already a duplicate)

**Interfaces:**
- Produces: `addAddressInput({ address, chainId, label, ens }: {...}): AddAddressInput-shaped`, `updateAddressInput`, `removeAddressInput`, `setAddressIgnoredInput` — one builder per portfolio op, exact field names from `document-models/portfolio/v1/schema.graphql:154-180` (read it, do not retype from memory); `usePortfolioActions(portfolioId: string): { dispatch(actions: PortfolioAction[]): void; pending: boolean; error?: string }` — wraps `useDocumentSafe` + `dispatch` from reactor-browser; `portfolioNodeId(nodes): string | undefined` (moved).

- [ ] **Step 1: Failing test** — builders produce exactly `{ address, chainId, label, ensNames }` (note: model field is `ensNames: [String]` — verify by reading `AddAddressInput` before writing the assertion), trim/lowercase on address.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** builders + hook (hook: no logic worth testing beyond delegation; keep it 20 lines).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: tsc → commit** `feat(stackfolio): portfolio address mutation builders`

### Task 4: Holdings query (Balances data)

**Files:**
- Modify: `processors/portfolio-index/processor.ts` + `rows.ts` (new `holdings` view rows: latest snapshot's `assets[]` exploded × the wallet they belong to — snapshot rows exist today, per-asset-per-account do not; the reconciler writes a snapshot with `assets: [{asset, amount, value}]` and the index stores them per-snapshot; add a `holdings` table keyed `(documentId, asset, account)` refreshed on `TAKE_SNAPSHOT`/document-state rewrites)
- Modify: `subgraphs/portfolio-index/schema.graphql` + resolvers (`holdings(driveId)`)
- Modify: `editors/stackfolio/lib/graphql.ts` (`useHoldings`)
- Test: `processors/portfolio-index/processor.test.ts` (+holdings case); `editors/stackfolio/lib/graphql.test.ts` (pivot)

**Interfaces:**
- Produces: GraphQL `portfolioApi.holdings(driveId: String!): [HoldingRow!]!` with `HoldingRow { documentId, asset, account /* address or hl/… locator */, quantity, value }` (amount + value strings from the snapshot's AssetValue rows; account comes from the wallet whose positions/ledger contributed — if the current snapshot model has no per-account attribution, fall back to `account = "portfolio"` for snapshot-level assets and per-document rows for wallet-native balances, and say so in the resolver comment); `useHoldings(driveId): QueryState<HoldingRow[]>`; `buildBalances(rows: HoldingRow[]): { perAsset: AssetTotal[]; perAccount: AccountTotal[]; total: string }` — pure pivot, decimal-string add via `lib/format.ts`'s existing exact helper, NEVER float.
- Consumes: existing `snapshots(driveId)` shape `{ assets { asset amount value } }` (graphql.ts:301) as the data source.

- [ ] **Step 1: Failing test** — `buildBalances` on two assets × two wallets: per-asset totals, per-account totals, grand total, decimal-exact ("0.1"+"0.2" === "0.3").
- [ ] **Step 2: Run pivot test** → FAIL.
- [ ] **Step 2b: Processor test** — a `TAKE_SNAPSHOT` state yields one `holdings` row per (asset, account); re-snapshot replaces rows (no duplicates). Run → FAIL.
- [ ] **Step 3: Implement** rows + reducer path, resolver, hook, pivot.
- [ ] **Step 4: Run both tests** → PASS; `npx tsc` clean; re-register the subgraph/processor if codegen-gated (DRAFT→CONFIRMED, `getCodegenStatus` settled).
- [ ] **Step 5: Probe live**: `curl -s localhost:7844/graphql` with `holdings(driveId:"22rEHinq…")` → rows for the live drive.
- [ ] **Step 6: Commit** `feat(portfolio-index): holdings rows and balances pivot`

### Task 5: CSV layer

**Files:**
- Create: `editors/stackfolio/lib/csv.ts`
- Test: `editors/stackfolio/lib/csv.test.ts`

**Interfaces:**
- Produces: `csvEscape(cell: string | number | null | undefined): string`, `toCsv(headers: string[], rows: (string | number | null)[][]): string`, `downloadCsv(filename: string, csv: string): void`.

- [ ] **Step 1: Failing tests** — quoting (embedded `"` doubled), newline cells, CRLF input normalized; injection guard: `"=cmd"` → `"'=cmd"`, same for `+`, `-`, `@`; `downloadCsv` builds a `Blob`+`URL.createObjectURL` and clicks an `<a download>` (assert via injected `document`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement. Step 4:** PASS. **Step 5:** Commit `feat(stackfolio): csv export with injection guard`.

### Task 6: Search candidates

**Files:**
- Create: `editors/stackfolio/lib/search.ts`
- Test: `editors/stackfolio/lib/search.ts` sibling `search.test.ts`

**Interfaces:**
- Produces: `SearchHit { kind: "page" | "account" | "asset" | "event"; label: string; sub?: string; to: { page: Page; detail?: string } }`, `buildHits(query: string, data: { accounts, assets, events }, entries = NAV_ENTRIES): SearchHit[]` — case-insensitive substring on label/sub, cap 8 per kind, empty query → nav pages only.

- [ ] **Step 1: Failing tests** — ranking (label starts-with beats substring), caps, empty-query nav list, account hit `to` carries `detail: slug(address)`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (pure; takes data arrays, no hooks). **Step 4:** PASS. **Step 5:** Commit `feat(stackfolio): search candidate builder`.

### Task 7: History page rework — events, issues sub-tab, CSV, row links

**Files:**
- Modify: `editors/stackfolio/components/Transactions.tsx` (sub-tab + export + row click)
- Modify: `editors/stackfolio/lib/graphql.ts` (`useEventsByIds` if the events page lacks direct-id fetch — check existing `EventsFilter.ids` first; reuse it when present)
- Test: `editors/stackfolio/components/Transactions.test.tsx` (new, jsdom)

**Interfaces:**
- Consumes: `EventsFilter`, `useEventsPage`, `useIssues`, `toCsv`, route `setSearchParams({ detail })` via router (pass `onOpenEvent(id)` callback prop — shell wires it; keep the component router-agnostic).
- Produces: `Transactions` gains props `{ sub: "events" | "issues"; onExport(): void; onOpenEvent(id: string): void }`; issues sub-tab lists `Issue` rows (severity, message, count) with a link to the owning filter.

- [ ] **Step 1: Failing tests** — render with stub data: sub-tab click switches list (query by `useIssues` mock); export button calls `onExport` with the current filtered set; row click calls `onOpenEvent(event.id)`; Review-Focus row: `=SUM` note cell renders escaped (existing escaping, assert).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** PASS. **Step 5:** Wire `onExport` in the page shell: full filtered set = loop `useEventsPage` offsets? NO — add `eventsExport: limit 5000 guard` query in `graphql.ts` reusing the same filter shape (document choice in code comment). **Step 6:** tsc/lint/vitest + commit `feat(stackfolio): history page with issues sub-tab and csv export`.

### Task 8: Balances view

**Files:**
- Create: `editors/stackfolio/components/Balances.tsx`
- Test: `editors/stackfolio/components/Balances.test.tsx`
- Modify: page shell (`balances` case)

**Interfaces:**
- Consumes: `useHoldings`, `buildBalances`, `money`/`fmtFiat`, `Donut`/`Sparkline` (`lib/charts.tsx`), `EmptyState`.
- Produces: `Balances({ driveId, onOpenAsset(assetId), onOpenAccount(address) })` — matrix table (asset × totals; expandable account rows), totals footer, allocation donut top-8+Other.

- [ ] **Step 1: Failing tests** — stub `useHoldings`/`useLatestPrices`: totals row sums decimal-exactly; empty rows → `EmptyState`; asset click → `onOpenAsset(identifier)`; account click → `onOpenAccount`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** PASS. **Step 5:** Commit `feat(stackfolio): balances view`.

### Task 9: Detail route plumbing

**Files:**
- Create: `hosts/connect/routes/_app/stackfolio/$driveSlug/-$detail.tsx`
- Modify: `$page.tsx` (render nested `<Outlet/>` for overlay; keep page component for `/balances` alone)

**Interfaces:**
- Produces: route `/_app/stackfolio/$driveSlug/$page/-$detail`; `$page.tsx` passes `detail: string | undefined` down through the section props (`onOpenEvent` sets `detail: slug(id)` via `useNavigate`).
- Consumes: Task 2 slug helpers.

- [ ] **Step 1: Route file** with `createFileRoute("/_app/stackfolio/$driveSlug/$page/-$detail")({ component: () => <Outlet/> })` — pattern from connect-core's `{-$nodeSlug}`. If flat (non-nested) is simpler for file-based routing, use search-param `?detail=` instead and canonicalize on open — record the chosen mechanism here and keep ONE (nested segment preferred: Back works).
- [ ] **Step 2: `npx ph-cli connect build`** → tree contains `$/driveSlug/$page/-$detail`. **Step 3: tsc** → clean. **Step 4: Commit** `feat(connect): optional detail segment under portfolio pages`.

### Task 10: Command palette

**Files:**
- Create: `editors/stackfolio/components/CommandPalette.tsx`
- Modify: `Shell.tsx` (search button + `Ctrl+K`/`Cmd+K` listener lives in Shell)

**Interfaces:**
- Consumes: `buildHits`, `useAccounts`, `useAssets`, `useEventsPage(driveId, { query })`; router `useNavigate`.
- Produces: `CommandPalette({ open, onClose, driveId })` — input, up to 24 hits, Enter navigates `to: "/_app/stackfolio/$driveSlug/$page"` with params/search, Escape closes, focus returned to trigger.

- [ ] **Step 1: Failing tests** — keyboard: `Ctrl+K` opens (dispatch on `window`), Escape closes, ArrowDown moves active, Enter invokes active hit.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (list keyboard: no radix dependency added). **Step 4:** PASS. **Step 5: Commit** `feat(stackfolio): ctrl+k command palette`.

### Task 11: Asset detail overlay

**Files:**
- Create: `editors/stackfolio/components/AssetDetail.tsx`
- Modify: page shell (`detail` + `page === "balances" | "assets"` → overlay beside table)

**Interfaces:**
- Consumes: `usePriceHistory(driveId, asset)`, `useOverrides`, `useAssets`, `useHoldings` rows for the asset; `Sparkline`/price chart pattern from `Prices.tsx`.
- Produces: `AssetDetail({ driveId, assetId, onClose })` — holdings, price history chart, manual-override form dispatching `SET_PRICE_OVERRIDE` through `usePortfolioActions` (pattern from Task 3; op name from schema, not memory).

- [ ] **Step 1: Failing test** — asset id with no price rows renders name + "No price history" (Review-Focus); holdings line sums match `buildBalances` total for that asset.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** PASS. **Step 5:** Commit `feat(stackfolio): asset detail overlay`.

### Task 12: Address book page

**Files:**
- Create: `editors/stackfolio/components/AddressBookView.tsx`
- Modify: page shell (`address-book` case), `detail` on accounts/history opens it

**Interfaces:**
- Consumes: `useAddressLabels(driveId)`, `usePortfolioActions(portfolioId)`, builders from Task 3; reactormanaged dispatch (no new HTTP).
- Produces: full CRUD table — add form (address, chain, label, ens), inline label edit, ignore toggle, delete (confirm inline); unknown-address deep link (`?detail=0x…`) shows "not in this portfolio" row + Add prefilled (Review-Focus slug test here).

- [ ] **Step 1: Failing tests** — builders dispatched exactly once with the right shapes (stub dispatch); delete asks confirm before dispatching `REMOVE_ADDRESS`; ignored rows show badge and toggle dispatches `SET_ADDRESS_IGNORED { ignored: true }`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** PASS. **Step 5:** Live check (Vetra running, drive `22rEHinq…`): add a throwaway address via UI, confirm row + GraphQL reflects, remove it. **Step 6:** Commit `feat(stackfolio): editable address book page`.

### Task 13: Event detail overlay + cutover

**Files:**
- Create: `editors/stackfolio/components/EventDetail.tsx`
- Modify: page shell; `editors/stackfolio/editor.tsx` (remove tab shell + `Nav` import; keep wizard/children/files), delete `components/Nav.tsx`, `components/Accounts.tsx` merge-check (accounts view reachable via Balances→account drill and address book), drop dead `AccountsSection` from sections
- Test: `editors/stackfolio/components/EventDetail.test.tsx`

**Interfaces:**
- Consumes: `EventsFilter.ids` page (fetch the single event by id), `useAddressLabels` for counterparty names, `useRealizedEvents` when the event appears in P&L (link to pnl page).
- Produces: `EventDetail({ driveId, eventId, onClose })` — full row: timestamp, type/subtype, asset + qty (registry decimals), valuation, counterparty (label if known), tx hash, batch id; actions: "open in history filtered", "open account".

- [ ] **Step 1: Failing tests** — unknown id → "No such event" + close (Review-Focus); event whose wallet vanished still renders its own fields (stale-detail rule: it never reads live account rows for required data).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** overlay. **Step 4:** PASS. **Step 5: Cutover:** editor.tsx — `children` → editor; wizard when `!plan.ready`; else fall through to the drive-app's existing Files layout (`FolderTree` + `DriveContents`, today's `files` case) so opening the app outside the Connect routes never blanks; routes own every other view; `git rm components/Nav.tsx` + any import now dead (compiler finds them). **Step 6: Full checks** `npm run tsc && npm run lint:fix && npx vitest run && npx ph-cli connect build`. **Step 7:** Live pass on `http://localhost:2844/` (connectUrl from `.ph/vetra-runtime.json`): drawer sections order, `/d/<drive>/history/<eventId>` deep link + Back, palette, CSV downloads, wizard still gates a fresh drive. **Step 8:** Commit `feat(stackfolio): event detail and route-shell cutover`.

### Task 14: Docs + cleanup sweep

**Files:**
- Modify: `README.md` (views/navigation map), `local://stackfolio-ui-spec.md` stays as spec
- Delete: any scaffold left (`Nav.tsx` gone in 13; grep for orphaned imports)

- [ ] **Step 1: `grep -rn "Nav\b" editors/stackfolio hosts`** → no dangling refs; `grep -rn "tab=" editors/` → no `?tab=` links left.
- [ ] **Step 2:** README: drawer map table (paste spec's table), Ctrl+K note.
- [ ] **Step 3:** Full checks + commit `docs(stackfolio): navigation map after the route-shell cutover`.
