/**
 * The accounting index's tables, one set per drive (the processor runs
 * namespaced). Idempotent: `up` runs on every start and after upgrades.
 */
import type { Kysely } from "kysely";
import type { DB } from "./schema.js";

// Quantities, costs and prices stay text: wei exceeds float precision.
const text = "text";
const stamp = "varchar(64)";

export async function up(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("acc_events")
    .addColumn("document_id", "varchar(255)", (col) => col.notNull())
    .addColumn("wallet", "varchar(64)", (col) => col.notNull())
    .addColumn("event_id", "varchar(64)", (col) => col.notNull())
    .addColumn("event_identifier", stamp, (col) => col.notNull())
    .addColumn("sequence_index", "integer", (col) => col.notNull())
    .addColumn("timestamp", stamp, (col) => col.notNull())
    .addColumn("type", "varchar(32)", (col) => col.notNull())
    .addColumn("subtype", "varchar(32)", (col) => col.notNull())
    .addColumn("asset", "varchar(128)", (col) => col.notNull())
    .addColumn("amount", text, (col) => col.notNull())
    .addColumn("counterparty", "varchar(128)")
    .addColumn("ignored", "boolean", (col) => col.notNull())
    .addColumn("price", text)
    .addColumn("price_unit", "varchar(16)")
    .addColumn("price_source", "varchar(32)")
    .addPrimaryKeyConstraint("acc_events_pk", [
      "document_id",
      "event_id",
    ])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("acc_addresses")
    .addColumn("document_id", "varchar(255)", (col) => col.notNull())
    .addColumn("address", "varchar(64)", (col) => col.notNull())
    .addPrimaryKeyConstraint("acc_addresses_pk", [
      "document_id",
      "address",
    ])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("acc_assets")
    .addColumn("document_id", "varchar(255)", (col) => col.notNull())
    .addColumn("asset", "varchar(128)", (col) => col.notNull())
    .addColumn("decimals", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("acc_assets_pk", ["document_id", "asset"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("lots")
    .addColumn("wallet", "varchar(64)", (col) => col.notNull())
    .addColumn("asset", "varchar(128)", (col) => col.notNull())
    .addColumn("source_event_id", "varchar(64)", (col) => col.notNull())
    .addColumn("source_seq", "integer", (col) => col.notNull())
    .addColumn("quantity", text, (col) => col.notNull())
    .addColumn("unit_cost", text, (col) => col.notNull())
    .addPrimaryKeyConstraint("lots_pk", [
      "wallet",
      "asset",
      "source_event_id",
      "source_seq",
    ])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("realized")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("wallet", "varchar(64)", (col) => col.notNull())
    .addColumn("asset", "varchar(128)", (col) => col.notNull())
    .addColumn("timestamp", stamp, (col) => col.notNull())
    .addColumn("quantity", text, (col) => col.notNull())
    .addColumn("cost", text, (col) => col.notNull())
    .addColumn("proceeds", text, (col) => col.notNull())
    .addColumn("pnl", text, (col) => col.notNull())
    .addColumn("source_event_id", "varchar(64)", (col) => col.notNull())
    .addColumn("source_seq", "integer", (col) => col.notNull())
    .addColumn("consumed", text, (col) => col.notNull())
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("income")
    .addColumn("wallet", "varchar(64)", (col) => col.notNull())
    .addColumn("bucket", "varchar(32)", (col) => col.notNull())
    .addColumn("month", "varchar(7)", (col) => col.notNull())
    .addColumn("amount", text, (col) => col.notNull())
    .addPrimaryKeyConstraint("income_pk", ["wallet", "bucket", "month"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("pnl_month")
    .addColumn("wallet", "varchar(64)", (col) => col.notNull())
    .addColumn("month", "varchar(7)", (col) => col.notNull())
    .addColumn("income", text, (col) => col.notNull())
    .addColumn("expense", text, (col) => col.notNull())
    .addColumn("realized_pnl", text, (col) => col.notNull())
    .addColumn("unpriced_in_count", "integer", (col) => col.notNull())
    .addColumn("unpriced_out_count", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("pnl_month_pk", ["wallet", "month"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("fold_checkpoint")
    .addColumn("id", "varchar(16)", (col) => col.primaryKey())
    .addColumn("fold_version", "integer", (col) => col.notNull())
    .addColumn("ctx_hash", "varchar(64)", (col) => col.notNull())
    .addColumn("input_hash", "varchar(64)", (col) => col.notNull())
    .addColumn("state", text, (col) => col.notNull())
    .ifNotExists()
    .execute();
}

export async function down(db: Kysely<DB>): Promise<void> {
  for (const table of [
    "fold_checkpoint",
    "pnl_month",
    "income",
    "realized",
    "lots",
    "acc_assets",
    "acc_addresses",
    "acc_events",
  ] as const) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
