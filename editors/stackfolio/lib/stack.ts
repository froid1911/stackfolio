/**
 * The protocol stack: where the money sits — held in wallets, supplied to
 * or borrowed from a protocol, staked on the beacon chain — each with its
 * own net, adding up to one total.
 *
 * A protocol's figures come from its own read (the portfolio document's
 * positions), not from the ledger's receipt tokens: the ledger folds
 * aEthWBTC from transfers and can drift from what Aave reports (2.16 vs
 * 1.29 WBTC on a live drive). So a wallet the protocol read covers drops
 * its Aave receipt and debt tokens, and the protocol group carries them.
 */
import type { DocWalletPositions } from "../components/DeFi.js";
import { buildBalances } from "../../../subgraphs/portfolio-api/lib.js";
import { allocate, chainLabel, isDebtToken, symbolOf, type AssetBook } from "./assets.js";
import { unscale } from "./format.js";

const ETH = "eip155:1/slip44:60";

export interface StackLine {
  asset: string;
  symbol: string;
  /** Decimal string in whole units (validators: ETH). */
  quantity: string;
  /** In the portfolio currency; null when unpriced. */
  value: number | null;
}

export interface StackGroup {
  id: string;
  kind: "wallet" | "protocol" | "staking";
  label: string;
  sub: string;
  /** Wallet and staking rows; a protocol's are split below. */
  lines: StackLine[];
  supplied: StackLine[];
  borrowed: StackLine[];
  /** Priced value of the group, borrowings subtracted. */
  net: number;
  /** Lowest health factor a protocol reported, if any. */
  health: number | null;
  /** Rows the net leaves out for want of a price. */
  unpriced: number;
  /** Wallet rows kept out of the net, by reason. */
  hidden: { spam: number; debt: number; negative: number };
}

export interface Stack {
  groups: StackGroup[];
  total: number;
}

export interface StackInput {
  book: AssetBook;
  /** Newest price per asset identifier, per whole unit. */
  prices: Map<string, string>;
  /** Live holdings per (asset, wallet). */
  holdings: { asset: string; wallet: string; quantity: string; value: string | null }[];
  positions: DocWalletPositions[];
  validators: { index: number; balanceEth: number }[];
}

/** Aave v2/v3 receipt and debt tokens: "aEthWBTC", "aPolUSDC", "variableDebtEthUSDT". */
export function isAaveReceipt(symbol: string): boolean {
  return /^a(Eth|Pol|Arb|Opt|Base|Ava|Gno|Scr|Lin|Bnb|Zks|Mnt|Son)[A-Za-z0-9]/.test(symbol) || isDebtToken(symbol);
}

/** "supplied — health 1.63" → 1.63. */
export function parseHealth(note: string | null | undefined): number | null {
  const match = note ? /health\s+([\d.]+)/i.exec(note) : null;
  return match ? Number(match[1]) : null;
}

/** "aave-v3" → "Aave v3". */
function protocolLabel(protocol: string): string {
  const [head = protocol, ...rest] = protocol.split("-");
  return [head.charAt(0).toUpperCase() + head.slice(1), ...rest].join(" ");
}

function emptyGroup(id: string, kind: StackGroup["kind"], label: string, sub: string): StackGroup {
  return {
    id, kind, label, sub,
    lines: [], supplied: [], borrowed: [],
    net: 0, health: null, unpriced: 0,
    hidden: { spam: 0, debt: 0, negative: 0 },
  };
}

export function buildStack(input: StackInput): Stack {
  const { book, prices } = input;
  const symbol = (id: string) => symbolOf(book.byId, id);
  const priceOf = (id: string): number | null => {
    const price = prices.get(id);
    return price === undefined ? null : Number(price);
  };

  // Wallets the protocol read covers for Aave: their receipt tokens move out.
  const aaveWallets = new Set(
    input.positions
      .filter((w) => w.positions.some((p) => p.protocol.toLowerCase().startsWith("aave")))
      .map((w) => w.wallet.toLowerCase()),
  );
  const walletRows = input.holdings.filter(
    (h) => !(aaveWallets.has(h.wallet.toLowerCase()) && isAaveReceipt(symbol(h.asset))),
  );
  const alloc = allocate(buildBalances(walletRows).perAsset, book);
  const wallet = emptyGroup("wallet", "wallet", "Wallet", "held directly");
  const line = (a: { asset: string; quantity: string; value: string | null }): StackLine => ({
    asset: a.asset,
    symbol: symbol(a.asset),
    quantity: a.quantity,
    value: a.value === null ? null : Number(a.value),
  });
  wallet.lines = [...alloc.valued, ...alloc.negative, ...alloc.unpriced].map(line);
  wallet.net = Number(alloc.total);
  wallet.unpriced = alloc.unpriced.length;
  wallet.hidden = { spam: alloc.spam.length, debt: alloc.debt.length, negative: alloc.negative.length };

  // Protocols: one group per protocol and chain, assets summed in raw units.
  const protocols = new Map<string, { group: StackGroup; raw: Map<string, bigint> }>();
  for (const entry of input.positions) {
    for (const position of entry.positions) {
      const id = `${position.protocol}@${entry.chainId}`;
      let slot = protocols.get(id);
      if (!slot) {
        slot = {
          group: emptyGroup(id, "protocol", protocolLabel(position.protocol), chainLabel(entry.chainId)),
          raw: new Map(),
        };
        protocols.set(id, slot);
      }
      const health = parseHealth(position.note);
      if (health !== null) {
        slot.group.health = slot.group.health === null ? health : Math.min(slot.group.health, health);
      }
      for (const held of position.assets) {
        slot.raw.set(held.asset, (slot.raw.get(held.asset) ?? 0n) + BigInt(held.amount));
      }
    }
  }
  for (const { group, raw } of protocols.values()) {
    for (const [asset, amount] of raw) {
      if (amount === 0n) continue;
      const decimals = book.byId.get(asset)?.decimals ?? 18;
      const magnitude = amount < 0n ? -amount : amount;
      const quantity = unscale(magnitude.toString(), decimals) ?? "0";
      const price = priceOf(asset);
      const value = price === null ? null : Number(quantity) * price;
      const row = { asset, symbol: symbol(asset), quantity, value };
      if (value === null) group.unpriced += 1;
      if (amount < 0n) {
        group.borrowed.push(row);
        group.net -= value ?? 0;
      } else {
        group.supplied.push(row);
        group.net += value ?? 0;
      }
    }
    const byValue = (a: StackLine, b: StackLine) => (b.value ?? -1) - (a.value ?? -1);
    group.supplied.sort(byValue);
    group.borrowed.sort(byValue);
  }

  const groups = [wallet, ...[...protocols.values()].map((p) => p.group)];

  if (input.validators.length > 0) {
    const staking = emptyGroup("staking", "staking", "Beacon chain", "ETH validators");
    const price = priceOf(ETH);
    staking.lines = input.validators.map((v) => ({
      asset: ETH,
      symbol: `#${v.index}`,
      quantity: String(v.balanceEth),
      value: price === null ? null : v.balanceEth * price,
    }));
    staking.net = staking.lines.reduce((sum, l) => sum + (l.value ?? 0), 0);
    staking.unpriced = price === null ? staking.lines.length : 0;
    groups.push(staking);
  }

  return { groups, total: groups.reduce((sum, g) => sum + g.net, 0) };
}
