import { createTestRelationalDb } from "@powerhousedao/shared/processors/testing";
import type { Kysely } from "kysely";
import { describe, expect, it } from "vitest";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";

/**
 * Stores persisted by the first version of these migrations carry
 * varchar(64) event columns and 42-char wallet columns; chains emit
 * longer identifiers, so `up` must widen what exists, and survive being
 * run again over its own output.
 */
describe("accounting migrations", () => {
  it("widens columns created by an older migration and re-runs cleanly", async () => {
    const db = createTestRelationalDb() as unknown as Kysely<DB>;
    // Born-small schema, as the first release wrote it: every column, with
    // the identifiers and addresses too narrow.
    await db.schema
      .createTable("acc_events")
      .addColumn("document_id", "varchar(255)", (col) => col.notNull())
      .addColumn("wallet", "varchar(64)", (col) => col.notNull())
      .addColumn("event_id", "varchar(64)", (col) => col.notNull())
      .addColumn("event_identifier", "varchar(64)", (col) => col.notNull())
      .addColumn("sequence_index", "integer", (col) => col.notNull())
      .addColumn("timestamp", "varchar(64)", (col) => col.notNull())
      .addColumn("type", "varchar(32)", (col) => col.notNull())
      .addColumn("subtype", "varchar(32)", (col) => col.notNull())
      .addColumn("asset", "varchar(128)", (col) => col.notNull())
      .addColumn("amount", "text", (col) => col.notNull())
      .addColumn("counterparty", "varchar(128)")
      .addColumn("ignored", "boolean", (col) => col.notNull())
      .addColumn("price", "text")
      .addColumn("price_unit", "varchar(16)")
      .addColumn("price_source", "varchar(32)")
      .ifNotExists()
      .execute();

    await up(db);
    await up(db); // second start over the widened schema

    const longId = `0x${"a".repeat(64)}:log:21000000`;
    await db
      .insertInto("acc_events")
      .values({
        document_id: "doc",
        wallet: `bc1q${"x".repeat(60)}`,
        event_id: longId,
        event_identifier: longId,
        sequence_index: 0,
        timestamp: "2026-01-01T00:00:00.000Z",
        type: "RECEIVE",
        subtype: "NONE",
        asset: "eip155:1/slip44:60",
        amount: "1",
        counterparty: null,
        ignored: false,
        price: null,
        price_unit: null,
        price_source: null,
      })
      .execute();
    const rows = await db.selectFrom("acc_events").selectAll().execute();
    expect(rows).toHaveLength(1);
  });
});
