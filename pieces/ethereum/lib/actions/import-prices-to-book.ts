import { createAction, Property } from "@powerhousedao/pieces-framework";
import { parseJsonish } from "../jsonish.js";
import { globalState, toGlobalAction } from "../reactor.js";

export const PRICE_BOOK_TYPE = "stackfolio/price-book";

interface PriceRow {
  asset: string;
  price: string;
  source: string;
  hour: string;
}

interface PriceBookGlobalState {
  baseCurrency?: string;
  latest?: Array<{ asset: string; price: string }>;
}

/**
 * File a CoinGecko run onto a stackfolio/price-book document. Prices that
 * already stand in the book are not re-recorded (the book rejects empty
 * records anyway); a failed fetch is recorded as a status event so the
 * dashboard can show why prices are stale.
 */
export const ethereumImportPricesToBookAction = createAction({
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "import-prices-to-book",
  displayName: "Import Prices into Price Book",
  description:
    "Record changed or new prices from a fetch-prices run onto a stackfolio/price-book document (history plus latest), and store a fetch error when the run reported one. Unchanged prices dispatch nothing.",
  props: {
    priceBookDocumentId: Property.ShortText({
      displayName: "Price book document id",
      required: true,
    }),
    pricesJson: Property.Json({
      displayName: "Price rows (JSON)",
      description: "{{steps.prices.output.prices}}",
      required: true,
    }),
    at: Property.ShortText({
      displayName: "Run timestamp (ISO)",
      required: true,
    }),
    errorMessage: Property.LongText({
      displayName: "Fetch error",
      description: "{{steps.prices.output.error}} - recorded as a fetch error when set.",
      required: false,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    const parsed = parseJsonish(p.pricesJson, "pricesJson");
    if (!Array.isArray(parsed)) {
      throw new Error("pricesJson must be a JSON array.");
    }

    const doc = await context.reactor.get(p.priceBookDocumentId);
    if (doc.header.documentType !== PRICE_BOOK_TYPE) {
      throw new Error(
        `Document ${p.priceBookDocumentId} is a ${doc.header.documentType}, not ${PRICE_BOOK_TYPE}.`,
      );
    }
    const state = globalState<PriceBookGlobalState>(doc);
    const latest = new Map(
      (state.latest ?? []).map((row) => [row.asset, row.price]),
    );
    // One row per asset, the last one wins if a page repeats an asset.
    const freshByAsset = new Map<string, PriceRow>();
    for (const row of parsed as PriceRow[]) {
      if (typeof row.asset === "string" && latest.get(row.asset) !== row.price) {
        freshByAsset.set(row.asset, row);
      }
    }
    const fresh = [...freshByAsset.values()];

    const actions = [];
    if (fresh.length > 0) {
      actions.push(
        toGlobalAction("RECORD_PRICES", {
          baseCurrency: state.baseCurrency ?? "EUR",
          fetchedAt: p.at,
          hour: fresh[0].hour,
          prices: fresh.map((row) => ({
            asset: row.asset,
            price: row.price,
            source: row.source,
          })),
        }),
      );
    }
    const errorMessage = p.errorMessage?.trim();
    if (errorMessage) {
      actions.push(toGlobalAction("RECORD_FETCH_ERROR", { at: p.at, error: errorMessage }));
    }
    if (actions.length > 0) {
      await context.reactor.execute(p.priceBookDocumentId, "main", actions);
    }
    return { recorded: fresh.length };
  },
});
