import {
  createTestRelationalDb,
  runProcessorMigrations,
  testOperation,
} from "@powerhousedao/shared/processors/testing";
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
import { describe, expect, it } from "vitest";

import { up } from "./migrations.js";
import { PortfolioIndex, WALLET_DOCUMENT_TYPE } from "./processor.js";

const ADDRESS = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";
const COUNTERPARTY = "0x00000000000000000000000000000000000000fe";

/** Replays documents through the processor as the reactor would. */
async function harness() {
  const db = createTestRelationalDb();
  const namespace = PortfolioIndex.getNamespace("drive-1");
  const store = await runProcessorMigrations<PortfolioIndex>(
    db,
    namespace,
    up,
  );
  const processor = new PortfolioIndex(namespace, { branch: ["main"] }, store);
  return { db: store, processor };
}

const walletDocument = () => {
  let document = walletReducer(
    walletUtils.createDocument(),
    walletActions.setAccountDetails({ address: ADDRESS, chainId: 1 }),
  );
  document = walletReducer(
    document,
    walletActions.importEvents({
      batchId: "b1",
      importedAt: "2026-11-11T00:00:00.000Z",
      events: [
        {
          id: "ev-1",
          eventIdentifier: "0xdead:0",
          timestamp: "2026-11-10T10:00:00.000Z",
          type: "RECEIVE",
          subtype: "NONE",
          asset: "ethereum",
          amount: "2000000000000000000",
          counterparty: COUNTERPARTY,
          sequenceIndex: 0,
        },
        {
          id: "ev-2",
          eventIdentifier: "0xdead:1",
          timestamp: "2026-11-10T11:00:00.000Z",
          type: "SPEND",
          subtype: "NONE",
          asset: "ethereum",
          amount: "1000000000000000000",
          counterparty: COUNTERPARTY,
          sequenceIndex: 1,
        },
      ],
    }),
  );
  return document;
};

/**
 * The batch a replay ends with: one operation per document carrying the
 * final global state - all the processor reads. (operationsWithContext on
 * a hand-built document yields its stored operations, and a test document
 * reduced by hand carries none.)
 */
function replay(
  document: { header: { id: string; documentType: string }; state: unknown },
  type = "REPLAY",
): OperationLike[] {
  const state = (document.state as { global: unknown }).global;
  const op = testOperation({
    documentId: document.header.id,
    documentType: document.header.documentType,
    type,
  });
  return [
    { ...op, context: { ...op.context, resultingState: JSON.stringify(state) } },
  ];
}

/**
 * The dispatcher sends the whole state envelope, not just the global state.
 * The index must read through it.
 */
function replayEnvelope(
  document: { header: { id: string; documentType: string }; state: unknown },
): OperationLike[] {
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

type OperationLike = ReturnType<typeof testOperation>;

describe("portfolio-index", () => {
  it("indexes the global state when the dispatcher sends the envelope", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    await processor.onOperations(replayEnvelope(wallet));

    const rows = await db
      .selectFrom("events")
      .select(["event_id", "amount"])
      .where("document_id", "=", wallet.header.id)
      .orderBy("sequence_index")
      .execute();
    expect(rows).toHaveLength(2);
  });

  it("carries the wallet's address and label onto every event row", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    const walletId = wallet.header.id;
    const ops = replay(wallet);
    await processor.onOperations(ops);

    const rows = await db
      .selectFrom("events")
      .selectAll()
      .where("document_id", "=", walletId)
      .orderBy("sequence_index")
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      event_id: "ev-1",
      address: ADDRESS,
      chain_id: 1,
      amount: "2000000000000000000",
      ignored: false,
    });

    const account = await db
      .selectFrom("accounts")
      .selectAll()
      .where("document_id", "=", walletId)
      .executeTakeFirstOrThrow();
    expect(account.address).toBe(ADDRESS);
  });

  it("refreshes counterparty labels when the address book changes", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    await processor.onOperations(replay(wallet));

    let portfolio = portfolioReducer(
      portfolioUtils.createDocument(),
      portfolioActions.setPortfolioDetails({ name: "Frank" }),
    );
    portfolio = portfolioReducer(
      portfolio,
      portfolioActions.addAddress({
        id: "ad-1",
        address: COUNTERPARTY,
        chainId: 1,
        label: "Cold wallet",
        timestamp: "2026-11-11T00:00:00.000Z",
      }),
    );
    await processor.onOperations(replay(portfolio));

    const labels = await db
      .selectFrom("events")
      .select("counterparty_label")
      .execute();
    expect(labels.map((row) => row.counterparty_label)).toEqual([
      "Cold wallet",
      "Cold wallet",
    ]);
  });

  it("drops every row when the document is deleted", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    const walletId = wallet.header.id;
    await processor.onOperations(replay(wallet));
    await processor.onOperations([
      testOperation({
        documentId: walletId,
        documentType: WALLET_DOCUMENT_TYPE,
        type: "DELETE_DOCUMENT",
        scope: "document",
      }),
    ]);

    const events = await db.selectFrom("events").selectAll().execute();
    const accounts = await db.selectFrom("accounts").selectAll().execute();
    expect(events).toEqual([]);
    expect(accounts).toEqual([]);
  });

  it("rewrites nothing when the same state is replayed", async () => {
    const { db, processor } = await harness();
    const wallet = walletDocument();
    const walletId = wallet.header.id;
    const ops = replay(wallet);
    await processor.onOperations(ops);
    const before = await db
      .selectFrom("events")
      .selectAll()
      .where("document_id", "=", walletId)
      .execute();
    await processor.onOperations(ops);
    const after = await db
      .selectFrom("events")
      .selectAll()
      .where("document_id", "=", walletId)
      .execute();
    expect(after).toEqual(before);
  });

  it("indexes snapshots and the reconciler's issues", async () => {
    const { db, processor } = await harness();
    let portfolio = portfolioReducer(
      portfolioUtils.createDocument(),
      portfolioActions.setPortfolioDetails({ name: "Frank" }),
    );
    portfolio = portfolioReducer(
      portfolio,
      portfolioActions.takeSnapshot({
        id: "sn-1",
        timestamp: "2026-11-11T00:00:00.000Z",
        totalValue: "42000",
        perLocation: [{ location: "wallet-1", value: "42000" }],
        perAsset: [{ asset: "ethereum", amount: "2000000000000000000", value: "42000" }],
      }),
    );
    portfolio = portfolioReducer(
      portfolio,
      portfolioActions.recordCheck({
        at: "2026-11-11T00:05:00.000Z",
        issues: [
          { code: "NO_GRANT", message: "nobody yet", severity: "BLOCKING" },
        ],
        fixes: [],
      }),
    );
    await processor.onOperations(replay(portfolio));

    const snapshots = await db.selectFrom("snapshots").selectAll().execute();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      id: "sn-1",
      total_value: "42000",
    });

    const issues = await db.selectFrom("check_issues").selectAll().execute();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "NO_GRANT",
      severity: "BLOCKING",
    });
  });
});
