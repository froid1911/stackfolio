# Stackfolio

A personal crypto portfolio as a Powerhouse package: your documents hold
the data, local workflows pull it from your own Ethereum nodes, and the
views in Connect render a full portfolio picture - without a Python server.

## What is in the box

| Piece | Role |
|---|---|
| `document-models/` | Five models: `portfolio` (the book), `wallet-account` (one address's ledger), `asset-registry`, `price-book`, `eth-staking` |
| `pieces/ethereum/` | A workflow piece: node scans (`scan-account-logs`, `scan-native-transactions`), state fetches, ENS lookups, CoinGecko prices, Prysm beacon reads, and the import actions that file everything onto documents |
| `processors/` | `portfolio-index` (the read model every view queries) and `stackfolio-reconciler`, which builds and repairs each portfolio's workflows |
| `subgraphs/portfolio-api/` | The GraphQL read API: accounts, ledger events, snapshots, staking, prices, issues - plus server-side ENS |
| `editors/stackfolio/` | The drive app: first-run wizard, dashboard, transactions ledger, accounts, staking, assets, prices |

## How a portfolio runs

1. **Wizard**: create/adopt the drive's singletons (portfolio, registry,
   price book), name who the book runs for (the grant), point at an
   execution node and a beacon node, add your first address (ENS names
   resolve through the node via `portfolioApi.ensAddress`).
2. **Reconciler** (a processor, sweeping every 5 minutes): without a
   grant or a reactor connection it only files issues. With both, it
   builds one live-scan workflow per wallet and a hourly price round,
   publishes them under your signature, and repairs them when they drift.
   The engine parks a workflow after a failed run; the reconciler notices
   the stopped progress marker (scan cursor, backfill cursor) and re-arms
   it, so a node hiccup costs one retry interval, not the portfolio.
3. **Live scan** (every 5 minutes): ERC-20 transfers, recent native
   blocks, head balance - imported onto the wallet's ledger; the
   portfolio's holdings, snapshots and issues follow from the index.

## Nodes and history

The piece talks to your own `geth --http` (127.0.0.1:8545) and a beacon
API (127.0.0.1:5052) - no third-party RPCs. A brand-new wallet's history
start is found by binary search on balance/nonce (birth discovery): exact
on an **archive** node; on a **snap-sync** node historical state reads
fail, so the scan settles at the oldest readable window and grows forward
from there. Full history on snap-sync needs the backfill: set the
wallet's backfill state (`SET_BACKFILL_STATE`, start and next block) and
the reconciler grows a `native-backfill` workflow that walks the history
2000 blocks at a time until the cursor passes the head and retires to
DONE.

## Commands

```bash
npm run vetra           # switchboard + Connect dev environment (ph vetra)
npm run tsc             # type-check package and hosts
npm run lint:fix        # oxlint (type-aware) with fixes
npm run test:coverage   # vitest; reducers held to 95%+ coverage
npm run build           # build the library
```
