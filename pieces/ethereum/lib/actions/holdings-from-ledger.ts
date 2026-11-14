import { createAction, Property } from "@powerhousedao/pieces-framework";
import { nativeIdentifier } from "../decode.js";
import { formatScaled, parseScaled, scaledProduct } from "../decimal.js";
import { parseJsonish } from "../jsonish.js";
import { globalState } from "../reactor.js";

const VALUE_SCALE = 8;

export interface HoldingRow {
  asset: string;
  symbol: string;
  /** Human-readable quantity (raw net balance scaled by the asset's decimals). */
  amount: string;
  /** Value in the portfolio's base currency, or null when unpriced. */
  value: string | null;
  /** True when any contributing wallet is still backfilling. */
  estimated: boolean;
}

interface WalletGlobalState {
  ignored?: boolean;
  chainId?: number;
  backfill?: { state?: string } | null;
  nativeBalance?: { amount: string; blockNumber: number } | null;
  tokenBalances?: { observedAt: string; balances: Array<{ asset: string; amount: string }> } | null;
  ledger?: Array<{
    asset: string;
    amount: string;
    type: string;
    ignored?: boolean;
    timestamp: string;
  }>;
}

interface PortfolioGlobalState {
  ignoredAssets?: string[];
  priceOverrides?: Array<{ asset: string; price: string }>;
  positions?: Array<{
    wallet: string;
    chainId: number;
    positions: Array<{
      protocol: string;
      kind: string;
      assets: Array<{ asset: string; amount: string }>;
    }>;
  }>;
}

interface PriceBookGlobalState {
  baseCurrency?: string;
  latest?: Array<{ asset: string; price: string }>;
}

interface RegistryGlobalState {
  assets?: Array<{ identifier: string; symbol?: string; decimals?: number }>;
}

const SIGN: Partial<Record<string, 1 | -1>> = {
  RECEIVE: 1,
  STAKING: 1, // beacon withdrawals land in the wallet
  SPEND: -1,
};

/**
 * Balance of the portfolio, straight from the ledgers: raw-unit BigInt sums
 * (exact), valued through overrides and the price book's latest prices.
 * Honest about gaps: an asset without a price carries `value: null` and
 * sets `incomplete`; a wallet whose backfill is not DONE marks its assets
 * `estimated`.
 */
export const ethereumHoldingsFromLedgerAction = createAction({
  requireAuth: false,
  requireReactor: "read",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "holdings-from-ledger",
  displayName: "Holdings from Ledgers",
  description:
    "Sum every wallet ledger per asset, value the balances with the price book (portfolio overrides first), and report what is missing: unpriced assets yield a null value and mark the result incomplete, still-backfilling wallets mark their assets estimated.",
  props: {
    portfolioDocumentId: Property.ShortText({
      displayName: "Portfolio document id",
      required: true,
    }),
    walletDocumentIdsJson: Property.Json({
      displayName: "Wallet document ids (JSON array)",
      required: true,
    }),
    priceBookDocumentId: Property.ShortText({
      displayName: "Price book document id",
      required: true,
    }),
    assetRegistryDocumentId: Property.ShortText({
      displayName: "Asset registry document id",
      required: true,
    }),
    asOf: Property.ShortText({
      displayName: "As of (ISO timestamp)",
      description: "Only count events at or before this instant. Default: now.",
      required: false,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    const walletIds = parseJsonish(p.walletDocumentIdsJson, "walletDocumentIdsJson");
    if (!Array.isArray(walletIds)) {
      throw new Error("walletDocumentIdsJson must be a JSON array.");
    }
    const asOf = p.asOf ?? new Date().toISOString();
    if (!Number.isFinite(Date.parse(asOf))) {
      throw new Error("asOf must be an ISO timestamp.");
    }

    const portfolio = globalState<PortfolioGlobalState>(
      await context.reactor.get(p.portfolioDocumentId),
    );
    const book = globalState<PriceBookGlobalState>(
      await context.reactor.get(p.priceBookDocumentId),
    );
    const registry = globalState<RegistryGlobalState>(
      await context.reactor.get(p.assetRegistryDocumentId),
    );

    const ignoredAssets = new Set(portfolio.ignoredAssets ?? []);
    const overrides = new Map(
      (portfolio.priceOverrides ?? []).map((o) => [o.asset, o.price]),
    );
    const latest = new Map((book.latest ?? []).map((l) => [l.asset, l.price]));
    const decimals = new Map<string, number>();
    const symbols = new Map<string, string>();
    for (const asset of registry.assets ?? []) {
      if (typeof asset.identifier !== "string") continue;
      if (typeof asset.decimals === "number") {
        decimals.set(asset.identifier, asset.decimals);
      }
      if (typeof asset.symbol === "string") {
        symbols.set(asset.identifier, asset.symbol);
      }
    }

    const nets = new Map<string, { raw: bigint; estimated: boolean }>();
    // Observed native coin balances per chain native asset: the ledger only
    // half-see native inflows (internal transfers need traces nobody free
    // offers), so the chain's own balance read is the truth for the coin.
    // Tokens read from the chain (tokenBalances) replace their ledger net
    // the same way: the scan misses swaps, repayments and bridges, and a
    // sum of transfers drifts where a balanceOf does not. A reading only
    // speaks for an `asOf` at or after it.
    const observed = new Map<string, bigint>();
    for (const walletId of walletIds) {
      if (typeof walletId !== "string") continue;
      const wallet = globalState<WalletGlobalState>(
        await context.reactor.get(walletId),
      );
      if (wallet.ignored) continue;
      const estimated = (wallet.backfill?.state ?? "DONE") !== "DONE";
      const native = nativeIdentifier(wallet.chainId ?? 1);
      const balance =
        wallet.nativeBalance && /^\d+$/.test(wallet.nativeBalance.amount ?? "")
          ? BigInt(wallet.nativeBalance.amount)
          : null;
      if (balance !== null && !ignoredAssets.has(native)) {
        observed.set(native, (observed.get(native) ?? 0n) + balance);
      }
      const tokens = new Set<string>();
      if (wallet.tokenBalances && wallet.tokenBalances.observedAt <= asOf) {
        for (const token of wallet.tokenBalances.balances) {
          if (!/^\d+$/.test(token.amount) || ignoredAssets.has(token.asset)) continue;
          tokens.add(token.asset);
          observed.set(token.asset, (observed.get(token.asset) ?? 0n) + BigInt(token.amount));
        }
      }
      for (const event of wallet.ledger ?? []) {
        if (event.ignored || ignoredAssets.has(event.asset)) continue;
        if (event.timestamp > asOf) continue;
        if (event.asset === native && balance !== null) continue;
        if (tokens.has(event.asset)) continue;
        const sign = SIGN[event.type];
        if (!sign) continue;
        const entry = nets.get(event.asset) ?? { raw: 0n, estimated: false };
        entry.raw += parseScaled(event.amount, 0) * BigInt(sign);
        entry.estimated ||= estimated;
        nets.set(event.asset, entry);
      }
    }
    for (const [asset, raw] of observed) {
      const ledger = nets.get(asset);
      nets.set(asset, {
        raw: raw + (ledger?.raw ?? 0n),
        estimated: ledger?.estimated ?? false,
      });
    }

    let incomplete = false;
    let totalScaled = 0n;
    const holdings: HoldingRow[] = [];
    for (const [asset, { raw, estimated }] of nets) {
      if (raw === 0n && estimated === false) continue;
      const amountDecimals = decimals.get(asset);
      const price = overrides.get(asset) ?? latest.get(asset) ?? null;
      if (amountDecimals === undefined || price === null) {
        incomplete = true;
        holdings.push({
          asset,
          symbol: symbols.get(asset) ?? asset.slice(-6),
          amount:
            amountDecimals === undefined
              ? raw.toString()
              : formatScaled(raw, amountDecimals),
          value: null,
          estimated,
        });
        continue;
      }
      const valueScaled = scaledProduct(price, raw, amountDecimals, VALUE_SCALE);
      totalScaled += valueScaled;
      holdings.push({
        asset,
        symbol: symbols.get(asset) ?? asset.slice(-6),
        amount: formatScaled(raw, amountDecimals),
        value: formatScaled(valueScaled, VALUE_SCALE),
        estimated,
      });
    }

    // Everything the portfolio can hold a view on: ledger assets and the
    // assets of the DeFi positions the reconciler swept (supplied and
    // borrowed alike — a borrowed stablecoin is an exposure the price book
    // must have a row for, or the debts table renders blanks).
    const identifiers = new Set<string>(nets.keys());
    for (const entry of portfolio.positions ?? []) {
      for (const position of entry.positions ?? []) {
        for (const held of position.assets ?? []) {
          if (typeof held.asset === "string") identifiers.add(held.asset);
        }
      }
    }

    return {
      holdings,
      identifiers: [...identifiers],
      totalValue: formatScaled(totalScaled, VALUE_SCALE),
      incomplete,
      baseCurrency: book.baseCurrency ?? "EUR",
    };
  },
});
