import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumImportPricesToBookAction } from "./import-prices-to-book.js";

const get = vi.fn();
const execute = vi.fn();

const bookDoc = (latest: Array<{ asset: string; price: string }>) => ({
  header: { documentId: "b1", documentType: "stackfolio/price-book" },
  state: { global: { baseCurrency: "EUR", latest } },
});

const row = (asset: string, price: string) => ({
  asset,
  price,
  source: "COINGECKO",
  hour: "2026-11-11T10:00:00.000Z",
});

const run = (props: Record<string, unknown>) =>
  ethereumImportPricesToBookAction.run({
    propsValue: {
      priceBookDocumentId: "b1",
      at: "2026-11-11T10:00:00.000Z",
      ...props,
    },
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<
    typeof ethereumImportPricesToBookAction.run
  >[0]);

beforeEach(() => {
  get.mockReset();
  execute.mockReset();
  execute.mockResolvedValue({});
});

describe("import-prices-to-book", () => {
  it("records moved and new prices, skipping unchanged ones", async () => {
    get.mockResolvedValue(bookDoc([{ asset: "eth", price: "2900" }]));

    const result = (await run({
      pricesJson: JSON.stringify([row("eth", "2950.1"), row("usdc", "0.95"), row("eth", "2950.1")]),
    })) as { recorded: number };

    expect(result.recorded).toBe(2);
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions[0].type).toBe("RECORD_PRICES");
    expect(actions[0].input).toMatchObject({
      baseCurrency: "EUR",
      fetchedAt: "2026-11-11T10:00:00.000Z",
      hour: "2026-11-11T10:00:00.000Z",
    });
  });

  it("stays silent when every price still stands", async () => {
    get.mockResolvedValue(bookDoc([{ asset: "eth", price: "2950.1" }]));

    const result = (await run({
      pricesJson: JSON.stringify([row("eth", "2950.1")]),
    })) as { recorded: number };

    expect(result.recorded).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("records a fetch error even when nothing moved", async () => {
    get.mockResolvedValue(bookDoc([{ asset: "eth", price: "2950.1" }]));

    await run({
      pricesJson: JSON.stringify([row("eth", "2950.1")]),
      errorMessage: "CoinGecko answered HTTP 429",
    });

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("RECORD_FETCH_ERROR");
    expect(actions[0].input).toEqual({
      at: "2026-11-11T10:00:00.000Z",
      error: "CoinGecko answered HTTP 429",
    });
  });
});
