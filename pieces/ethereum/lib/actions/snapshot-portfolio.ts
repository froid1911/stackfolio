import { createAction, Property } from "@powerhousedao/pieces-framework";
import { formatScaled, parseScaled } from "../decimal.js";
import { toGlobalAction } from "../reactor.js";

const VALUE_SCALE = 8;
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
    holdingsJson: Property.LongText({
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
  },
  async run(context) {
    const p = context.propsValue;
    let holdings: HoldingsOutput;
    try {
      holdings = JSON.parse(p.holdingsJson) as HoldingsOutput;
    } catch {
      throw new Error("holdingsJson must be the holdings step's JSON output.");
    }
    const rows = (holdings.holdings ?? []).filter(
      (row) => typeof row.asset === "string",
    );
    const priced = rows.filter((row) => row.value !== null);

    const doc = await context.reactor.get(p.portfolioDocumentId);
    if (doc.header.documentType !== PORTFOLIO_TYPE) {
      throw new Error(
        `Document ${p.portfolioDocumentId} is a ${doc.header.documentType}, not ${PORTFOLIO_TYPE}.`,
      );
    }

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

    await context.reactor.execute(
      p.portfolioDocumentId,
      "main",
      [
        toGlobalAction("TAKE_SNAPSHOT", {
          id: p.snapshotId,
          timestamp: p.timestamp,
          totalValue: formatScaled(totalScaled, VALUE_SCALE),
          perLocation,
          perAsset,
        }),
      ],
    );
    return {
      snapshot: true,
      snapshotId: p.snapshotId,
      totalValue: formatScaled(totalScaled, VALUE_SCALE),
      incomplete: holdings.incomplete ?? false,
    };
  },
});
