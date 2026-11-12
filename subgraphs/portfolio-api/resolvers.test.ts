import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import {
  createTestRelationalDb,
  runProcessorMigrations,
  testOperation,
} from "@powerhousedao/shared/processors/testing";
import {
  actions as assetActions,
  reducer as assetReducer,
  utils as assetUtils,
} from "document-models/asset-registry/v1";
import {
  actions as portfolioActions,
  reducer as portfolioReducer,
  utils as portfolioUtils,
} from "document-models/portfolio/v1";
import {
  actions as walletActions,
  reducer as walletReducer,
  utils as walletUtils,
} from "document-models/wallet-account/v1";
import { AccountingIndex } from "processors/accounting-index";
import { up } from "../../processors/accounting-index/migrations.js";
import { describe, expect, it } from "vitest";
import { getResolvers } from "./resolvers.js";

const W1 = "0x1111111111111111111111111111111111111111";
const W2 = "0x2222222222222222222222222222222222222222";
const ETH = "eip155:1/slip44:60";

const price = (value: string) => ({
  unit: "EUR",
  price: value,
  source: "COINGECKO" as const,
  granularity: "NONE" as const,
  pinnedAt: "2026-11-11T00:00:00.000Z",
});

type TestDocument = {
  header: { id: string; documentType: string };
  state: unknown;
};

/** One ledger: buy 2 ETH, sell 1 priced, 5% staking income, sell 0.25
 * unpriced - so every P&L query has something to show. */
function walletDocument() {
  let document = walletReducer(
    walletUtils.createDocument(),
    walletActions.setAccountDetails({ address: W1, chainId: 1 }),
  );
  document = walletReducer(
    document,
    walletActions.importEvents({
      batchId: "b1",
      importedAt: "2026-11-11T00:00:00.000Z",
      events: [
        {
          id: "ev-1",
          eventIdentifier: "0xaa:0",
          timestamp: "2026-01-10T10:00:00.000Z",
          type: "RECEIVE",
          subtype: "NONE",
          asset: ETH,
          amount: "2000000000000000000",
          counterparty: "0xfeed",
          sequenceIndex: 0,
          valuation: price("2000"),
        },
        {
          id: "ev-2",
          eventIdentifier: "0xbb:0",
          timestamp: "2026-02-10T10:00:00.000Z",
          type: "SPEND",
          subtype: "NONE",
          asset: ETH,
          amount: "1000000000000000000",
          counterparty: "0xfeed",
          sequenceIndex: 0,
          valuation: price("3000"),
        },
        {
          id: "ev-3",
          eventIdentifier: "0xcc:0",
          timestamp: "2026-03-10T10:00:00.000Z",
          type: "STAKING",
          subtype: "BLOCK_PRODUCTION",
          asset: ETH,
          amount: "50000000000000000",
          sequenceIndex: 0,
          valuation: price("3000"),
        },
        {
          id: "ev-4",
          eventIdentifier: "0xdd:0",
          timestamp: "2026-04-10T10:00:00.000Z",
          type: "SPEND",
          subtype: "NONE",
          asset: ETH,
          amount: "250000000000000000",
          counterparty: "0xfeed",
          sequenceIndex: 0,
        },
      ],
    }),
  );
  return document;
}

const portfolioDocument = () => {
  let document = portfolioReducer(
    portfolioUtils.createDocument(),
    portfolioActions.setPortfolioDetails({ name: "P", baseCurrency: "EUR" }),
  );
  document = portfolioReducer(
    document,
    portfolioActions.addAddress({
      id: "a1",
      address: W1,
      chainId: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
    }),
  );
  return document;
};

const registryDocument = () =>
  assetReducer(
    assetUtils.createDocument(),
    assetActions.registerAsset({
      id: "eth",
      identifier: ETH,
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      kind: "NATIVE",
      chainId: 1,
      coingeckoId: "ethereum",
      custom: false,
      addedAt: "2026-01-01T00:00:00.000Z",
    }),
  );

function replay(document: TestDocument) {
  const op = testOperation({
    documentId: document.header.id,
    documentType: document.header.documentType,
    type: "REPLAY",
  });
  return [
    {
      ...op,
      context: {
        ...op.context,
        resultingState: JSON.stringify(document.state),
      },
    },
  ];
}

/** Fold the ledger into drive-1's accounting namespace and hand back the
 * resolvers plus the read context that may see the drive's documents. */
async function harness() {
  const relationalDb = createTestRelationalDb();
  const namespace = AccountingIndex.getNamespace("drive-1");
  const store = await runProcessorMigrations<AccountingIndex>(
    relationalDb,
    namespace,
    up,
  );
  const processor = new AccountingIndex(namespace, { branch: ["main"] }, store);

  const wallet = walletDocument();
  const portfolio = portfolioDocument();
  const registry = registryDocument();
  for (const document of [registry, portfolio, wallet]) {
    await processor.onOperations(replay(document));
  }

  const nodes = [wallet, portfolio, registry].map((document) => ({
    kind: "file" as const,
    id: document.header.id,
  }));
  const subgraph = {
    relationalDb,
    assertCanRead: async () => ({ fetchIdentifier: "drive-1" }),
  } as unknown as BaseSubgraph;
  const ctx = {
    clients: {
      read: {
        get: async () => ({ state: { global: { nodes } } }),
      },
    },
  } as unknown as Context;

  const resolvers = getResolvers(subgraph) as unknown as {
    PortfolioApiSubgraphQueries: Record<
      string,
      (
        parent: unknown,
        args: Record<string, unknown>,
        ctx: Context,
      ) => Promise<unknown>
    >;
  };
  const q = Object.fromEntries(
    Object.entries(resolvers.PortfolioApiSubgraphQueries).map(
      ([name, resolve]) => [
        name,
        (args: Record<string, unknown> = {}) =>
          resolve(null, { ...args, driveId: "drive-1" }, ctx),
      ],
    ),
  );
  return { q };
}

describe("portfolio-api accounting queries", () => {
  it("lists open lots with per-whole-unit cost", async () => {
    const { q } = await harness();
    const lots = (await q.openLots()) as Record<string, unknown>[];
    expect(lots).toHaveLength(2);
    expect(lots[0]).toMatchObject({
      wallet: W1,
      asset: ETH,
      sourceEventId: "ev-1",
      quantity: "750000000000000000",
      unitCost: "2000.00000000",
    });
    expect(lots[1]).toMatchObject({
      sourceEventId: "ev-3",
      quantity: "50000000000000000",
      unitCost: "3000.00000000",
    });
    expect(await q.openLots({ wallet: W2 })).toEqual([]);
  });

  it("lists realized disposals with consumed lot lineage", async () => {
    const { q } = await harness();
    const rows = (await q.realizedEvents()) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      wallet: W1,
      asset: ETH,
      quantity: "1000000000000000000",
      cost: "200000000000",
      proceeds: "300000000000",
      pnl: "100000000000",
      sourceEventId: "ev-2",
      consumed: [
        {
          sourceEventId: "ev-1",
          quantity: "1000000000000000000",
          cost: "200000000000",
        },
      ],
    });
    const afterFeb = (await q.realizedEvents({
      from: "2026-03-01T00:00:00.000Z",
    })) as unknown[];
    expect(afterFeb).toEqual([]);
  });

  it("lists income by month", async () => {
    const { q } = await harness();
    expect(await q.incomeByMonth()).toEqual([
      {
        wallet: W1,
        bucket: "BLOCK_PRODUCTION",
        month: "2026-03",
        amount: "15000000000",
      },
    ]);
  });

  it("reports monthly P&L inside the requested window", async () => {
    const { q } = await harness();
    const all = (await q.pnlReport({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T00:00:00.000Z",
    })) as Record<string, unknown>[];
    const byMonth = new Map(all.map((r) => [r.month, r]));
    expect(byMonth.get("2026-02")).toMatchObject({
      wallet: W1,
      realizedPnl: "100000000000",
      expense: "0",
    });
    expect(byMonth.get("2026-03")).toMatchObject({ income: "15000000000" });

    const windowed = (await q.pnlReport({
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-12-31T00:00:00.000Z",
    })) as Record<string, unknown>[];
    expect(windowed.every((r) => (r.month as string) >= "2026-03")).toBe(true);
    expect(windowed.some((r) => r.month === "2026-02")).toBe(false);
  });

  it("summarises unpriced events per month", async () => {
    const { q } = await harness();
    expect(await q.unpricedSummary()).toEqual([
      { wallet: W1, month: "2026-04", inCount: 0, outCount: 1 },
    ]);
  });

  it("returns nothing for a drive whose documents are gone", async () => {
    const denied = {
      relationalDb: createTestRelationalDb(),
      assertCanRead: async () => ({ fetchIdentifier: "drive-2" }),
    } as unknown as BaseSubgraph;
    const resolvers = getResolvers(denied) as unknown as {
      PortfolioApiSubgraphQueries: Record<
        string,
        (p: unknown, a: unknown, c: Context) => Promise<unknown>
      >;
    };
    const ctx = { clients: { read: { get: async () => null } } } as unknown as
      Context;
    expect(
      await resolvers.PortfolioApiSubgraphQueries.openLots(null, {
        driveId: "drive-2",
      }, ctx),
    ).toEqual([]);
  });
});
