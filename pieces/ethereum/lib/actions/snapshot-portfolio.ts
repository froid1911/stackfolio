import { createAction, Property } from "@powerhousedao/pieces-framework";
import { formatScaled, parseScaled } from "../decimal.js";
import { parseJsonish } from "../jsonish.js";
import { toGlobalAction } from "../reactor.js";

const VALUE_SCALE = 8;
const TOKEN_SCALE = 18;
const PORTFOLIO_TYPE = "stackfolio/portfolio";

interface HoldingsOutput {
  holdings?: Array<{
    asset: string;
    amount: string;
    value: string | null;
  }>;
  totalValue?: string;
  incomplete?: boolean;
}

function chainLocation(asset: string): string {
  if (asset.startsWith("bip122:")) return "BITCOIN";
  const match = /^eip155:(\d+)\//.exec(asset);
  const chainId = match ? Number(match[1]) : 1;
  return chainId === 1 ? "ETHEREUM" : `EIP155_${chainId}`;
}

/**
 * Persist a holdings run as a portfolio snapshot: TAKE_SNAPSHOT with the
 * totals the holdings step computed. Rows without a price are excluded from
 * the values (a snapshot never contains a guessed number); the snapshot
 * simply covers less than the whole portfolio.
 */
export const ethereumSnapshotPortfolioAction = createAction({
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "snapshot-portfolio",
  displayName: "Snapshot Portfolio",
  description:
    "Store a holdings-from-ledger result as a TAKE_SNAPSHOT on the stackfolio/portfolio document: total, per-asset and per-chain values. Unpriced rows are left out of the values; an all-unpriced holdings result stores nothing.",
  props: {
    portfolioDocumentId: Property.ShortText({
      displayName: "Portfolio document id",
      required: true,
    }),
    holdingsJson: Property.Json({
      displayName: "Holdings output (JSON)",
      description: "The full JSON object of the holdings step.",
      required: true,
    }),
    snapshotId: Property.ShortText({
      displayName: "Snapshot id",
      required: true,
    }),
    timestamp: Property.ShortText({
      displayName: "Snapshot timestamp (ISO)",
      required: true,
    }),
    registryJson: Property.Json({
      displayName: "Asset registry (JSON)",
      description:
        "The asset-registry document state. Rows whose asset is registered as kind DEBT are booked as liabilities (valued 1:1 through the underlying's price) instead of assets; without it every row is an asset and net worth stays unknown.",
      required: false,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    const holdings = parseJsonish(
      p.holdingsJson,
      "holdingsJson",
    ) as HoldingsOutput;
    const rows = (holdings.holdings ?? []).filter(
      (row) => typeof row.asset === "string",
    );

    const doc = await context.reactor.get(p.portfolioDocumentId);
    if (doc.header.documentType !== PORTFOLIO_TYPE) {
      throw new Error(
        `Document ${p.portfolioDocumentId} is a ${doc.header.documentType}, not ${PORTFOLIO_TYPE}.`,
      );
    }

    // Registry classification: DEBT rows are liabilities, everything else
    // an asset. A malformed registry is treated as absent: every row stays
    // an asset and the snapshot carries no net worth claim.
    const debts = new Map<string, string | null>();
    let registryKnown = false;
    if (p.registryJson) {
      try {
        const parsed = parseJsonish(
          p.registryJson,
          "registryJson",
        ) as {
          assets?: Array<{
            identifier?: unknown;
            kind?: unknown;
            underlying?: unknown;
          }>;
        };
        for (const asset of parsed.assets ?? []) {
          if (typeof asset.identifier !== "string") continue;
          if (asset.kind === "DEBT") {
            debts.set(
              asset.identifier,
              typeof asset.underlying === "string" ? asset.underlying : null,
            );
          }
        }
        registryKnown = true;
      } catch {
        registryKnown = false;
      }
    }

    const debtRows = rows.filter((row) => debts.has(row.asset));
    const priced = rows
      .filter((row) => !debts.has(row.asset))
      .filter((row) => row.value !== null);

    if (priced.length === 0) {
      return { snapshot: false, reason: "nothing priced to snapshot" };
    }

    const perAsset = priced.map((row) => ({
      asset: row.asset,
      amount: row.amount,
      value: row.value as string,
    }));
    const byLocation = new Map<string, bigint>();
    for (const row of priced) {
      const location = chainLocation(row.asset);
      byLocation.set(
        location,
        (byLocation.get(location) ?? 0n) +
          parseScaled(row.value as string, VALUE_SCALE),
      );
    }
    const perLocation = [...byLocation.entries()].map(([location, scaled]) => ({
      location,
      value: formatScaled(scaled, VALUE_SCALE),
    }));
    const totalScaled = [...byLocation.values()].reduce((a, b) => a + b, 0n);

    // Debt valuation: 1:1 through the underlying's price. Holdings amounts
    // are human-readable token counts, so the underlying row's value per
    // token is all the math needs.
    const liabilities = debtRows.map((row) => ({
      asset: row.asset,
      amount: row.amount,
    }));
    let liabilitiesScaled: bigint | null = registryKnown ? 0n : null;
    for (const row of debtRows) {
      if (liabilitiesScaled === null) break;
      const underlying = debts.get(row.asset) ?? null;
      const source = underlying
        ? priced.find((row) => row.asset === underlying)
        : undefined;
      if (
        !source ||
        parseScaled(source.amount, TOKEN_SCALE) === 0n
      ) {
        liabilitiesScaled = null;
        break;
      }
      liabilitiesScaled +=
        (parseScaled(row.amount, TOKEN_SCALE) *
          parseScaled(source.value as string, VALUE_SCALE)) /
        parseScaled(source.amount, TOKEN_SCALE);
    }
    const netWorth =
      liabilitiesScaled === null
        ? null
        : formatScaled(totalScaled - liabilitiesScaled, VALUE_SCALE);

    await context.reactor.execute(
      p.portfolioDocumentId,
      "main",
      [
        toGlobalAction("TAKE_SNAPSHOT", {
          id: p.snapshotId,
          timestamp: p.timestamp,
          totalValue: formatScaled(totalScaled, VALUE_SCALE),
          netWorth,
          liabilities,
          perLocation,
          perAsset,
        }),
      ],
    );
    return {
      snapshot: true,
      snapshotId: p.snapshotId,
      totalValue: formatScaled(totalScaled, VALUE_SCALE),
      netWorth,
      liabilities: liabilities.length,
      incomplete: holdings.incomplete ?? false,
    };
  },
});
