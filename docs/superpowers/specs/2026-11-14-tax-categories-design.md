# Tax categories, review queue and German tax report

Status: approved in conversation 2026-11-14; written for review.

## Problem

Stackfolio books every transaction by its raw shape: a token arriving is a
purchase at market value, a token leaving is a sale. German tax law (like
CoinTracking's model of it) depends on *what kind* of transaction it was. A gift,
a loss, posted collateral, a liquidation or a move to one's own exchange account
are each treated differently, and a plain transfer to an unknown address cannot
be guessed. Today:

- liquidations are skipped (should be a sale of the collateral);
- gifts out, donations, losses and thefts are booked as sales;
- events typed `TRADE` are not booked at all;
- transfers to/from unknown addresses are silently guessed as purchase/sale.

## Decisions

- **Jurisdiction:** Germany (§23 EStG private sales, §22 Nr. 3 other income).
- **Vocabulary:** CoinTracking's categories (below), for familiarity and a CSV
  path to and from CoinTracking.
- **Storage:** rules and overrides in the portfolio document; chain data is never
  rewritten. Category = override › rule › derived default › Unclassified.
- **Unknown counterparties:** never guessed. Unclassified transactions are not
  booked and wait in a review queue.

## 1. Categories and their treatment

| Category | Books |
|---|---|
| Trade | Sale of the given asset (FIFO), purchase of the received asset, both at market value. |
| Spend | Sale at market value. |
| Income, Staking, Lending income, Mining | §22 Nr. 3 income at market value on receipt; new lot at that cost, acquired that day. Staking/lending do not extend the holding period (BMF 10.05.2022). |
| Airdrop | Income as above. |
| Airdrop (non-taxable) | No income; lot at cost 0, acquired that day. |
| Gift/Tip in | No purchase; lot takes over the giver's cost and acquisition date (§23 Abs. 1 S. 3), entered on the override. Without them: a "basis" gap. |
| Gift/Tip out, Donation | Leaves the books FIFO with no gain or loss. |
| Lost, Stolen | Leaves the books FIFO with no gain or loss; listed separately. |
| Deposit / Withdrawal (own exchange or wallet) | Lots move with cost and acquisition date unchanged. |
| Collateral out / Collateral in | Not a disposal; the asset stays the holder's with its lots. |
| Borrowing / Loan repayment | Neither purchase nor sale, and no income. Borrowed units open a lot at market value (so spending them later has a cost basis); a repayment consumes lots FIFO at cost with no gain or loss. |
| Liquidation | Sale of the seized collateral at market value. |
| Fee | Cost of the sale in the same transaction; with no sale (a transfer), the fee units leave the books with no gain. |
| Margin / Derivatives | Out of scope (§20 EStG); listed separately. |
| Unclassified | Not booked; counted in the queue and the report. |

Disputed points, implemented as stated and named in the report as assumptions to
confirm with a Steuerberater: fees on transfers between own wallets, airdrops,
lost/stolen units, LP deposits/withdrawals (treated as not a disposal).

## 2. Where a category comes from

### Portfolio model additions (`stackfolio/portfolio`)

State:

- `categoryRules: [CategoryRule!]!` with `CategoryRule { id: OID!, counterparty: String!` (lower-cased address)`, chainId: Int, direction: CategoryDirection!` (IN, OUT, ANY)`, asset: String, category: TxCategory!, label: String }`.
- `categoryOverrides: [CategoryOverride!]!` with `CategoryOverride { wallet: String!` (lower-cased wallet address, as the books key wallets)`, eventId: String!, sequenceIndex: Int!, category: TxCategory!, giftCost: String, giftAcquiredAt: DateTime }`.
- `enum TxCategory` with the categories above in SCREAMING_SNAKE_CASE (TRADE, SPEND, INCOME, STAKING, LENDING_INCOME, MINING, AIRDROP, AIRDROP_NON_TAXABLE, GIFT_IN, GIFT_OUT, DONATION, LOST, STOLEN, DEPOSIT, WITHDRAWAL, COLLATERAL_OUT, COLLATERAL_IN, BORROWING, LOAN_REPAYMENT, LIQUIDATION, FEE, MARGIN).

Operations (module `categories`): ADD_CATEGORY_RULE, UPDATE_CATEGORY_RULE,
REMOVE_CATEGORY_RULE, SET_EVENT_CATEGORIES (one or many overrides, upsert by
wallet + eventId + sequenceIndex), CLEAR_EVENT_CATEGORIES. Errors for unknown
rule ids, a gift cost that is not a decimal, gift fields on a non-GIFT_IN
override. Documents made before the module read both lists as empty.

### Resolution: `categoryOf(event, ctx)`

One pure function in `processors/shared/categories.ts`, used by the accounting
fold, the subgraph and the editor. First match wins:

1. override for (wallet, eventId, sequenceIndex);
2. rule matching counterparty (+ chain, direction, asset when set); the most
   specific rule wins, then the newest;
3. derived default:
   - counterparty is one of the portfolio's own addresses → DEPOSIT (in) / WITHDRAWAL (out);
   - subtype DEPOSIT_ASSET → COLLATERAL_OUT, REMOVE_ASSET or protocol WITHDRAWAL → COLLATERAL_IN;
   - BORROW → BORROWING, REPAY → LOAN_REPAYMENT, LIQUIDATION → LIQUIDATION;
   - type TRADE, a decoded swap leg, or a transaction in which the same wallet
     sends one asset and receives another → TRADE;
   - beacon withdrawal (STAKING/WITHDRAWAL from the wallet itself) → STAKING,
     at 16 ETH or more → COLLATERAL_IN (stake returned);
   - YIELD → LENDING_INCOME, AIRDROP → AIRDROP, BLOCK_PRODUCTION → STAKING, FEE → FEE;
   - LP_MINT / LP_BURN → COLLATERAL_OUT / COLLATERAL_IN (disputed, flagged);
   - SPAM, APPROVE, NAME_REGISTRATION as today (off the books / FEE for the name cost);
4. otherwise UNCLASSIFIED.

Rows are grouped by transaction hash for the derived defaults: a decoded leg's
identifier is `<hash>-<log>`, a generic row's is `<hash>`, and both belong to the
same transaction.

The result carries its source (`override`, `rule`, `auto`, `unclassified`) for
the UI badge.

### Accounting index

Stages rules and overrides from the portfolio (as it stages ignored assets) into
`acc_category_rules` / `acc_category_overrides`; both join the fold's context
hash, so an edit re-folds. The fold switches from type/subtype sets to the
category table in section 1. Lots gain `acquired_at` (for the holding period;
gifts take the giver's date). FOLD_VERSION bumps.

## 2a. Spam and airdrops (decided 2026-11-14)

Measured on the live drive: of 461 ERC-20s, 314 (521 rows, 189 of them fake
"outgoing" transfers planted for address poisoning, 19 with lookalike names
such as `ÚЅDС`) were never moved in a transaction the portfolio's own wallet
sent and have no price anywhere. Real airdrops (ARB, PSP, CVX, ENS, GRT, UNI,
GTC: about EUR 50k) sit unclassified among them.

- **Signed:** a transaction counts as signed by a wallet when that wallet paid
  its gas (it carries the wallet's FEE row).
- **Spam (automatic):** an asset that no wallet of the portfolio ever moved in a
  signed transaction and that has no price (CoinGecko, DefiLlama or manual) is
  spam: category `SPAM`, source `auto`; not booked, not in the queue, not in any
  total. Native assets are never spam.
- **Spam (by hand):** "Mark as spam" ignores the asset (existing
  `ignoredAssets`). "Not spam" adds it to a new `trustedAssets` list (ops
  TRUST_ASSET / UNTRUST_ASSET), which the automatic rule never flags.
- **Known airdrop claims:** a receipt from a known claim contract
  (`processors/shared/airdrops.ts`: UNI MerkleDistributor, Arbitrum
  TokenDistributor, ENS token, ParaSwap PSP, Gitcoin GTC distributors, each
  verified against the live ledger) is `AIRDROP_NON_TAXABLE` by default.
- **Default airdrop treatment:** non-taxable, lot at cost 0, acquired on
  receipt (BMF 10.05.2022: income only where the recipient gave something in
  return). The user switches any airdrop to `AIRDROP` (income) per transaction
  or per distributor rule.
- **Suspected airdrops:** an unsigned receipt with a price, from a counterparty
  that is not the portfolio's own and not a known protocol, stays
  `UNCLASSIFIED` but the queue tags its group "suspected airdrop" with one-click
  choices Airdrop (non-taxable) · Airdrop (income) · Spam.
- **Other claim-shaped receipts** (signed, receive only, from a contract: reward
  claims such as Curve gauges or Aavegotchi alchemica) stay `UNCLASSIFIED` and
  group by paying contract in the queue, where one rule settles each.

## 3. Review queue (History page)

- A "Needs a type" tab beside "Needs a price": UNCLASSIFIED transactions grouped
  by counterparty, largest EUR value first; ignored assets never appear.
- Per group: choose a category, then "this transaction only" (overrides) or
  "always for this address" (a rule; optional label).
- Per transaction: the detail view sets the category (replacing the raw
  type/subtype editor); GIFT_IN asks for the giver's cost and date.
- The list shows each category with its source badge; a category filter.
- Dashboard and P&L show "N transactions unclassified (EUR X)" linking to the queue.

Subgraph: `events` gains `category`, `categorySource` and a `categories` filter;
a `classificationQueue(driveId)` query returns the grouped queue.

## 4. German tax report (P&L page, per calendar year)

- §23: disposals split by holding period (≤ 1 year taxable, > 1 year tax-free),
  lot by lot; the year's net taxable gain against the EUR 1,000 Freigrenze
  (all-or-nothing).
- §22 Nr. 3: income categories totalled against the EUR 256 Freigrenze
  (all-or-nothing).
- Listed apart: gifts, donations, lost/stolen, liquidations, out-of-scope
  derivatives, unclassified and unpriced counts, and the disputed-point
  assumptions.
- Export: per-year CSV of line items (Anlage SO) and a CoinTracking-format CSV.

## Build order

1. Model + resolution + fold (sections 1-2), with migrations and tests.
2. Review queue (section 3).
3. Tax report and exports (section 4).

Each part ships on its own branch and PR.

## Testing

- `categoryOf`: override › rule › auto › unclassified; rule specificity.
- Fold per category against worked German examples: the 365/366-day
  boundary, a gift carrying the giver's date, a liquidation, an exemption limit
  exceeded by one cent, borrowing not creating a lot.
- Portfolio reducers at the project's 95% coverage bar.
- Live: frankp.eth's Aave and Uniswap history classifies automatically; the
  remaining queue is small and grouped by counterparty.

## Out of scope

Margin/derivatives tax (§20), Austrian/Swiss rules, CoinTracking CSV import
(export only in v1), loan-interest gain splitting (repayment at cost in v1).
