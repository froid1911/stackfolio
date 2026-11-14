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
import { sql } from "kysely";
import { describe, expect, it } from "vitest";

import { up } from "./migrations.js";
import { AccountingIndex } from "./processor.js";

const W1 = "0x1111111111111111111111111111111111111111";
const W2 = "0x2222222222222222222222222222222222222222";
const ETH = "eip155:1/slip44:60";

async function harness() {
  const db = createTestRelationalDb();
  const namespace = AccountingIndex.getNamespace("drive-1");
  const store = await runProcessorMigrations<AccountingIndex>(
    db,
    namespace,
    up,
  );
  const processor = new AccountingIndex(namespace, { branch: ["main"] }, store);
  return { db: store, processor };
}

type TestDocument = {
  header: { id: string; documentType: string };
  state: unknown;
};

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

const price = (value: string) => ({
  unit: "EUR",
  price: value,
  source: "COINGECKO" as const,
  granularity: "NONE" as const,
  pinnedAt: "2026-11-11T00:00:00.000Z",
});

const walletDocument = (spendPrice = "3000") => {
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
          counterparty: "uniswap-v2",
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
          counterparty: "uniswap-v2",
          sequenceIndex: 0,
          valuation: price(spendPrice),
        },
      ],
    }),
  );
  return document;
};

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
  document = portfolioReducer(
    document,
    portfolioActions.addAddress({
      id: "a2",
      address: W2,
      chainId: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
    }),
  );
  return document;
};

const registryDocument = () => {
  const document = assetReducer(
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
  return document;
};

async function indexAll(
  processor: AccountingIndex,
  wallet: TestDocument,
) {
  await processor.onOperations(replay(registryDocument()));
  await processor.onOperations(replay(portfolioDocument()));
  await processor.onOperations(replay(wallet));
}

const editedWallet = (wallet: TestDocument) =>
  walletReducer(
    wallet as unknown as Parameters<typeof walletReducer>[0],
    walletActions.replaceEvents({
      batchId: "b2",
      remove: [{ id: "ev-2", sequenceIndex: 0 }],
      add: [
        {
          id: "ev-2",
          eventIdentifier: "0xbb:0",
          timestamp: "2026-02-10T10:00:00.000Z",
          type: "SPEND",
          subtype: "NONE",
          asset: ETH,
          amount: "1000000000000000000",
          counterparty: "uniswap-v2",
          sequenceIndex: 0,
          valuation: price("4000"),
        },
      ],
    }),
  );

describe("accounting-index", () => {
  it("folds the ledger into lots, realized PnL and month rows", async () => {
    const { db, processor } = await harness();
    await indexAll(processor, walletDocument());

    const lots = await db
      .selectFrom("lots")
      .selectAll()
      .where("wallet", "=", W1)
      .execute();
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      asset: ETH,
      source_event_id: "ev-1",
      quantity: "1000000000000000000",
    });

    const realized = await db.selectFrom("realized").selectAll().execute();
    expect(realized).toHaveLength(1);
    expect(realized[0]).toMatchObject({
      wallet: W1,
      asset: ETH,
      quantity: "1000000000000000000",
      cost: "200000000000",
      proceeds: "300000000000",
      pnl: "100000000000",
    });
    expect(JSON.parse(realized[0].consumed)).toEqual([
      { sourceEventId: "ev-1", quantity: "1000000000000000000", cost: "200000000000", acquiredAt: "2026-01-10T10:00:00.000Z" },
    ]);

    const months = await db
      .selectFrom("pnl_month")
      .selectAll()
      .orderBy("month")
      .execute();
    expect(months.map((row) => row.month)).toEqual(["2026-01", "2026-02"]);
    expect(months[1]).toMatchObject({
      realized_pnl: "100000000000",
      unpriced_in_count: 0,
      unpriced_out_count: 0,
    });
  });

  it("fetches the document state when a delivery carries none", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    processor.setDocumentReader({ get: async () => ({ state: wallet.state }) });

    await processor.onOperations(replay(registryDocument()));
    await processor.onOperations(replay(portfolioDocument()));
    const op = testOperation({
      documentId: wallet.header.id,
      documentType: wallet.header.documentType,
      type: "SET_LABEL",
    });
    await processor.onOperations([op]);

    const lots = await db
      .selectFrom("lots")
      .selectAll()
      .where("wallet", "=", W1)
      .execute();
    expect(lots).toHaveLength(1);
  });

  it("stages chain identifiers longer than any conventional column", async () => {
    // Real log ids ("0x<64 hex>:log:<block>") and withdrawal ids overran
    // the first column sizes and the staging insert died under the host's
    // silent error handling; the books must take whatever chains emit.
    const { db, processor } = await harness();
    await processor.onOperations(replay(registryDocument()));
    await processor.onOperations(replay(portfolioDocument()));
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
            id: `withdrawal-${"9".repeat(80)}`,
            eventIdentifier: `0x${"a".repeat(64)}:log:21000000`,
            timestamp: "2026-01-10T10:00:00.000Z",
            type: "RECEIVE",
            subtype: "NONE",
            asset: ETH,
            amount: "2000000000000000000",
            counterparty: "uniswap-v2",
            sequenceIndex: 0,
            valuation: price("2000"),
          },
        ],
      }),
    );
    await processor.onOperations(replay(document));
    const events = await db.selectFrom("acc_events").selectAll().execute();
    expect(events).toHaveLength(1);
    expect(events[0].event_identifier).toContain(":log:");
  });

  it("refolds when a ledger row is edited", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    await indexAll(processor, wallet);
    const before = await db.selectFrom("fold_checkpoint").selectAll().execute();

    await processor.onOperations(replay(editedWallet(wallet)));

    const after = await db.selectFrom("fold_checkpoint").selectAll().execute();
    expect(after[0].input_hash).not.toBe(before[0].input_hash);
    const realized = await db.selectFrom("realized").selectAll().execute();
    expect(realized[0].pnl).toBe("200000000000");
  });

  it("keeps the last good books when a refold cannot be written", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    await indexAll(processor, wallet);
    const before = await db.selectFrom("fold_checkpoint").selectAll().execute();
    // Stand-in for a row the table refuses (it was a too-narrow column).
    await db.schema
      .alterTable("realized")
      .addCheckConstraint("refuse_edit", sql`pnl <> '200000000000'`)
      .execute();

    await expect(processor.onOperations(replay(editedWallet(wallet)))).rejects.toThrow();

    const realized = await db.selectFrom("realized").selectAll().execute();
    expect(realized.map((r) => r.pnl)).toEqual(["100000000000"]);
    expect(await db.selectFrom("pnl_month").selectAll().execute()).toHaveLength(2);
    const after = await db.selectFrom("fold_checkpoint").selectAll().execute();
    expect(after[0].input_hash).toBe(before[0].input_hash);
  });

  it("refolds on start when the stored books are an older fold version", async () => {
    const { db, processor } = await harness();
    await indexAll(processor, walletDocument());
    // As an older release left them: another version, and stale tables.
    await db.updateTable("fold_checkpoint").set({ fold_version: 1 }).execute();
    await db.deleteFrom("pnl_month").execute();

    await processor.initAndUpgrade();

    const [checkpoint] = await db.selectFrom("fold_checkpoint").selectAll().execute();
    expect(checkpoint.fold_version).not.toBe(1);
    expect(await db.selectFrom("pnl_month").selectAll().execute()).toHaveLength(2);
  });

  it("keeps an ignored asset out of the books, and back in when un-ignored", async () => {
    const { db, processor } = await harness();
    await indexAll(processor, walletDocument());
    expect(await db.selectFrom("lots").selectAll().execute()).not.toHaveLength(0);

    const ignoring = portfolioReducer(
      portfolioDocument(),
      portfolioActions.setAssetIgnored({ asset: ETH, ignored: true }),
    );
    await processor.onOperations(replay(ignoring));
    expect(await db.selectFrom("lots").selectAll().execute()).toHaveLength(0);
    expect(await db.selectFrom("realized").selectAll().execute()).toHaveLength(0);
    expect(await db.selectFrom("pnl_month").selectAll().execute()).toHaveLength(0);
    expect(await db.selectFrom("acc_unpriced").selectAll().execute()).toHaveLength(0);

    const unignoring = portfolioReducer(
      ignoring,
      portfolioActions.setAssetIgnored({ asset: ETH, ignored: false }),
    );
    await processor.onOperations(replay(unignoring));
    expect(await db.selectFrom("lots").selectAll().execute()).not.toHaveLength(0);
    expect(await db.selectFrom("acc_ignored_assets").selectAll().execute()).toHaveLength(0);
  });

  it("keeps the checkpoint when nothing changed", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    await indexAll(processor, wallet);
    const before = await db.selectFrom("fold_checkpoint").selectAll().execute();

    await processor.onOperations(replay(wallet));

    const after = await db.selectFrom("fold_checkpoint").selectAll().execute();
    expect(after[0].input_hash).toBe(before[0].input_hash);
    expect(after[0].state).toBe(before[0].state);
  });

  it("removes a deleted wallet's rows and refolds", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    await indexAll(processor, wallet);
    await processor.onOperations([
      testOperation({
        documentId: wallet.header.id,
        documentType: wallet.header.documentType,
        type: "DELETE_DOCUMENT",
        scope: "document",
      }),
    ]);

    const events = await db.selectFrom("acc_events").selectAll().execute();
    expect(events).toHaveLength(0);
    const realized = await db.selectFrom("realized").selectAll().execute();
    expect(realized).toHaveLength(0);
  });

  it("counts unpriced disposals in the month row", async () => {
    const { db, processor } = await harness();
    await processor.onOperations(replay(registryDocument()));
    await processor.onOperations(replay(portfolioDocument()));
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
            id: "ev-x",
            eventIdentifier: "0xcc:0",
            timestamp: "2026-03-01T10:00:00.000Z",
            type: "SPEND",
            subtype: "NONE",
            asset: ETH,
            amount: "1000000000000000000",
            counterparty: "uniswap-v2",
            sequenceIndex: 0,
            valuation: price("2000"),
          },
        ],
      }),
    );
    await processor.onOperations(replay(document));

    const months = await db.selectFrom("pnl_month").selectAll().execute();
    expect(months[0]).toMatchObject({
      month: "2026-03",
      unpriced_in_count: 1,
    });
    const realized = await db.selectFrom("realized").selectAll().execute();
    expect(realized).toHaveLength(0);
    // The leg behind the count is listed, so History can show it.
    const gaps = await db.selectFrom("acc_unpriced").selectAll().execute();
    expect(gaps).toEqual([
      {
        wallet: W1,
        event_id: "ev-x",
        sequence_index: 0,
        asset: ETH,
        timestamp: "2026-03-01T10:00:00.000Z",
        reason: "basis",
      },
    ]);
  });

  it("books by the portfolio's category rules and overrides, and records each event's category", async () => {
    const { db, processor } = await harness();
    await indexAll(processor, walletDocument());
    const before = await db.selectFrom("acc_event_categories").selectAll().execute();
    expect(before).toContainEqual(
      expect.objectContaining({ event_id: "ev-2", category: "TRADE", source: "auto" }),
    );
    expect((await db.selectFrom("lots").selectAll().execute())[0].acquired_at).toBe(
      "2026-01-10T10:00:00.000Z",
    );

    const tagged = portfolioReducer(
      portfolioDocument(),
      portfolioActions.setEventCategories({
        overrides: [{ wallet: W1, eventId: "ev-2", sequenceIndex: 0, category: "GIFT_OUT" }],
      }),
    );
    await processor.onOperations(replay(tagged));
    const row = await db
      .selectFrom("acc_event_categories")
      .selectAll()
      .where("event_id", "=", "ev-2")
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ category: "GIFT_OUT", source: "override" });
    // A gift realizes nothing.
    const realized = await db.selectFrom("realized").selectAll().execute();
    expect(realized.some((r) => r.source_event_id === "ev-2")).toBe(false);

    const ruled = portfolioReducer(
      tagged,
      portfolioActions.clearEventCategories({
        events: [{ wallet: W1, eventId: "ev-2", sequenceIndex: 0 }],
      }),
    );
    await processor.onOperations(replay(ruled));
    expect(await db.selectFrom("acc_category_overrides").selectAll().execute()).toHaveLength(0);
    expect(await db.selectFrom("realized").selectAll().execute()).toHaveLength(1);
  });

  it("calls an unsigned, unpriced token spam until the portfolio trusts it", async () => {
    const SPAM = "eip155:1/erc20:0x9e2d266d6c90f6c0d80a88159b15958f7135b8af";
    const { db, processor } = await harness();
    const pushed = walletReducer(
      walletDocument(),
      walletActions.importEvents({
        batchId: "b2",
        importedAt: "2026-11-11T00:00:00.000Z",
        events: [
          {
            id: "ev-spam",
            eventIdentifier: "0xcc:0",
            timestamp: "2026-03-10T10:00:00.000Z",
            type: "RECEIVE",
            subtype: "NONE",
            asset: SPAM,
            amount: "923000000000000000000000",
            counterparty: "0xd152f549545093347a162dce210e7293f1452150",
            sequenceIndex: 0,
          },
        ],
      }),
    );
    await indexAll(processor, pushed);
    const categoryOf = async () =>
      (
        await db
          .selectFrom("acc_event_categories")
          .select("category")
          .where("event_id", "=", "ev-spam")
          .executeTakeFirstOrThrow()
      ).category;
    expect(await categoryOf()).toBe("SPAM");

    const trusting = portfolioReducer(
      portfolioDocument(),
      portfolioActions.setAssetTrusted({ asset: SPAM, trusted: true }),
    );
    await processor.onOperations(replay(trusting));
    expect(await db.selectFrom("acc_trusted_assets").selectAll().execute()).toHaveLength(1);
    expect(await categoryOf()).toBe("UNCLASSIFIED");
  });
});
