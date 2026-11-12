import { actions, reducer, utils } from "document-models/price-book/v1";
import { describe, expect, it } from "vitest";

const { recordPrices, setBaseCurrency, recordFetchError } = actions;

const ETH = "eip155:1/slip44:60";

const record = (
  prices: Array<{ asset: string; price: string; source: string }>,
  overrides: Record<string, unknown> = {},
) => ({
  baseCurrency: "EUR",
  prices,
  hour: "2026-11-11T10:00:00.000Z",
  fetchedAt: "2026-11-11T10:00:05.000Z",
  ...overrides,
});

describe("PricesOperations", () => {
  it("should handle recordPrices operation", () => {
    const document = reducer(
      utils.createDocument(),
      recordPrices(record([{ asset: ETH, price: "2950.10", source: "coingecko" }])),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.latest).toEqual([
      {
        asset: ETH,
        price: "2950.10",
        source: "coingecko",
        fetchedAt: "2026-11-11T10:00:05.000Z",
      },
    ]);
    expect(document.state.global.history).toHaveLength(1);
    expect(document.state.global.status.lastFetchAt).toBe(
      "2026-11-11T10:00:05.000Z",
    );
    expect(document.state.global.status.lastError).toBeNull();
  });

  it("should upsert the latest price by asset", () => {
    let document = reducer(
      utils.createDocument(),
      recordPrices(record([{ asset: ETH, price: "1", source: "coingecko" }])),
    );
    document = reducer(
      document,
      recordPrices(
        record([{ asset: ETH, price: "2", source: "defillama" }], {
          hour: "2026-11-11T11:00:00.000Z",
          fetchedAt: "2026-11-11T11:00:05.000Z",
        }),
      ),
    );

    expect(document.state.global.latest).toHaveLength(1);
    expect(document.state.global.latest[0]).toEqual({
      asset: ETH,
      price: "2",
      source: "defillama",
      fetchedAt: "2026-11-11T11:00:05.000Z",
    });
    expect(document.state.global.history).toHaveLength(2);
  });

  it("should replace the history point of the same hour", () => {
    let document = reducer(
      utils.createDocument(),
      recordPrices(record([{ asset: ETH, price: "1", source: "coingecko" }])),
    );
    document = reducer(
      document,
      recordPrices(record([{ asset: ETH, price: "1.5", source: "coingecko" }])),
    );

    expect(document.state.global.history).toHaveLength(1);
    expect(document.state.global.history[0].price).toBe("1.5");
  });

  it("should reject an empty record", () => {
    const document = reducer(utils.createDocument(), recordPrices(record([])));

    expect(document.operations.global[0].error).toBe(
      "A price record must carry at least one price",
    );
  });

  it("should reject a non-decimal price", () => {
    const document = reducer(
      utils.createDocument(),
      recordPrices(record([{ asset: ETH, price: "2,95", source: "coingecko" }])),
    );

    expect(document.operations.global[0].error).toBe(
      "2,95 is not a decimal amount",
    );
    expect(document.state.global.latest).toHaveLength(0);
    expect(document.state.global.history).toHaveLength(0);
  });

  it("should handle setBaseCurrency operation", () => {
    let document = reducer(
      utils.createDocument(),
      recordPrices(record([{ asset: ETH, price: "1", source: "coingecko" }])),
    );
    document = reducer(document, setBaseCurrency({ baseCurrency: "EUR" }));
    expect(document.state.global.latest).toHaveLength(1);

    document = reducer(document, setBaseCurrency({ baseCurrency: "USD" }));
    // EUR prices are meaningless in a USD book; both tables start over.
    expect(document.state.global.baseCurrency).toBe("USD");
    expect(document.state.global.latest).toHaveLength(0);
    expect(document.state.global.history).toHaveLength(0);
  });

  it("should reject an invalid currency", () => {
    const document = reducer(
      utils.createDocument(),
      setBaseCurrency({ baseCurrency: "eur" }),
    );

    expect(document.operations.global[0].error).toBe(
      "eur is not a 3-letter currency code",
    );
    expect(document.state.global.baseCurrency).toBe("EUR");
  });

  it("should handle recordFetchError operation, cleared by the next success", () => {
    let document = reducer(
      utils.createDocument(),
      recordFetchError({
        at: "2026-11-11T09:00:00.000Z",
        error: "coingecko unreachable",
      }),
    );
    expect(document.state.global.status).toEqual({
      lastFetchAt: "2026-11-11T09:00:00.000Z",
      lastError: "coingecko unreachable",
    });

    document = reducer(
      document,
      recordPrices(record([{ asset: ETH, price: "1", source: "coingecko" }])),
    );
    expect(document.state.global.status.lastError).toBeNull();
  });
});
