/**
 * The index's tables, one set per drive (the processor runs namespaced).
 * Idempotent: `up` runs on every start and after every upgrade.
 */
import type { Kysely } from "kysely";
import type { DB } from "./schema.js";

// Amounts stay text: wei and gwei exceed float precision, and the read
// side scales them with BigInt.
const stamp = "varchar(64)";
const amount = "text";

export async function up(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("events")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("event_id", "varchar(255)", (c) => c.notNull())
    .addColumn("event_identifier", "varchar(255)", (c) => c.notNull())
    .addColumn("sequence_index", "integer", (c) => c.notNull())
    .addColumn("timestamp", stamp, (c) => c.notNull())
    .addColumn("type", "varchar(32)", (c) => c.notNull())
    .addColumn("subtype", "varchar(32)", (c) => c.notNull())
    .addColumn("asset", "varchar(255)", (c) => c.notNull())
    .addColumn("amount", amount, (c) => c.notNull())
    .addColumn("counterparty", "varchar(255)")
    .addColumn("counterparty_label", "text")
    .addColumn("notes", "text")
    .addColumn("ignored", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("source", "varchar(16)", (c) => c.notNull())
    .addColumn("address", "varchar(255)", (c) => c.notNull())
    .addColumn("chain_id", "integer", (c) => c.notNull())
    .addColumn("label", "text")
    .addPrimaryKeyConstraint("events_pk", ["document_id", "event_id"])
    .ifNotExists()
    .execute();
  await db.schema
    .createIndex("events_by_time")
    .on("events")
    .columns(["timestamp desc", "document_id", "sequence_index"])
    .ifNotExists()
    .execute();
  await db.schema
    .createIndex("events_by_asset")
    .on("events")
    .column("asset")
    .ifNotExists()
    .execute();
  await db.schema
    .createIndex("events_by_identifier")
    .on("events")
    .columns(["event_identifier", "timestamp"])
    .ifNotExists()
    .execute();
  await db.schema
    .createIndex("events_by_counterparty")
    .on("events")
    .column("counterparty")
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("assets")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("identifier", "varchar(255)", (c) => c.notNull())
    .addColumn("symbol", "varchar(64)", (c) => c.notNull())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("decimals", "integer", (c) => c.notNull())
    .addColumn("kind", "varchar(16)", (c) => c.notNull())
    .addColumn("chain_id", "integer", (c) => c.notNull())
    .addColumn("coingecko_id", "varchar(64)")
    .addColumn("custom", "boolean", (c) => c.notNull().defaultTo(false))
    .addPrimaryKeyConstraint("assets_pk", ["document_id", "identifier"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("prices_latest")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("asset", "varchar(255)", (c) => c.notNull())
    .addColumn("price", amount, (c) => c.notNull())
    .addColumn("source", "varchar(64)", (c) => c.notNull())
    .addColumn("fetched_at", stamp, (c) => c.notNull())
    .addPrimaryKeyConstraint("prices_latest_pk", ["document_id", "asset"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("prices_history")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("asset", "varchar(255)", (c) => c.notNull())
    .addColumn("hour", stamp, (c) => c.notNull())
    .addColumn("price", amount, (c) => c.notNull())
    .addColumn("source", "varchar(64)", (c) => c.notNull())
    .addPrimaryKeyConstraint("prices_history_pk", [
      "document_id",
      "asset",
      "hour",
    ])
    .ifNotExists()
    .execute();
  await db.schema
    .createIndex("prices_history_by_asset")
    .on("prices_history")
    .columns(["asset", "hour desc"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("snapshots")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("id", "varchar(255)", (c) => c.notNull())
    .addColumn("timestamp", stamp, (c) => c.notNull())
    .addColumn("total_value", amount, (c) => c.notNull())
    .addColumn("per_location_json", "text", (c) => c.notNull())
    .addColumn("per_asset_json", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("snapshots_pk", ["document_id", "id"])
    .ifNotExists()
    .execute();
  await db.schema
    .createIndex("snapshots_by_time")
    .on("snapshots")
    .column("timestamp desc")
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("price_overrides")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("asset", "varchar(255)", (c) => c.notNull())
    .addColumn("price", amount, (c) => c.notNull())
    .addColumn("set_at", stamp, (c) => c.notNull())
    .addPrimaryKeyConstraint("price_overrides_pk", ["document_id", "asset"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("address_labels")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("address", "varchar(255)", (c) => c.notNull())
    .addColumn("label", "text")
    .addColumn("ens_name", "text")
    .addPrimaryKeyConstraint("address_labels_pk", ["document_id", "address"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("validators")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("validator_index", "integer", (c) => c.notNull())
    .addColumn("public_key", "varchar(255)", (c) => c.notNull())
    .addColumn("withdrawal_address", "varchar(255)")
    .addColumn("activation_ts", "integer")
    .addColumn("exited_ts", "integer")
    .addColumn("withdrawable_ts", "integer")
    .addPrimaryKeyConstraint("validators_pk", [
      "document_id",
      "validator_index",
    ])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("staking_balances")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("validator_index", "integer", (c) => c.notNull())
    .addColumn("day", "varchar(16)", (c) => c.notNull())
    .addColumn("balance_gwei", amount, (c) => c.notNull())
    .addPrimaryKeyConstraint("staking_balances_pk", [
      "document_id",
      "validator_index",
      "day",
    ])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("withdrawals")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("withdrawal_ref", "integer", (c) => c.notNull())
    .addColumn("validator_index", "integer", (c) => c.notNull())
    .addColumn("amount_gwei", amount, (c) => c.notNull())
    .addColumn("block_number", "integer", (c) => c.notNull())
    .addColumn("timestamp", stamp, (c) => c.notNull())
    .addPrimaryKeyConstraint("withdrawals_pk", ["document_id", "withdrawal_ref"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("accounts")
    .addColumn("document_id", "varchar(255)", (c) => c.primaryKey())
    .addColumn("address", "varchar(255)", (c) => c.notNull())
    .addColumn("chain_id", "integer", (c) => c.notNull())
    .addColumn("label", "text")
    .addColumn("ignored", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("last_logs_block", "integer")
    .addColumn("last_native_scan_block", "integer")
    .addColumn("last_run_at", stamp)
    .addColumn("backfill_state", "varchar(16)")
    .addColumn("native_balance", amount)
    .addColumn("native_balance_block", "integer")
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("check_issues")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("seq", "integer", (c) => c.notNull())
    .addColumn("code", "varchar(64)", (c) => c.notNull())
    .addColumn("severity", "varchar(16)", (c) => c.notNull())
    .addColumn("message", "text", (c) => c.notNull())
    .addColumn("account_id", "varchar(255)")
    .addColumn("at", stamp, (c) => c.notNull())
    .addPrimaryKeyConstraint("check_issues_pk", ["document_id", "seq"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("hl_accounts")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("address", "varchar(255)", (c) => c.notNull())
    .addColumn("label", "text")
    .addColumn("account_value_usd", amount)
    .addColumn("updated_at", stamp)
    .addPrimaryKeyConstraint("hl_accounts_pk", ["document_id", "address"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("hl_spot")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("address", "varchar(255)", (c) => c.notNull())
    .addColumn("token_index", "integer", (c) => c.notNull())
    .addColumn("coin", "varchar(64)", (c) => c.notNull())
    .addColumn("total", amount, (c) => c.notNull())
    .addColumn("hold", amount, (c) => c.notNull())
    .addPrimaryKeyConstraint("hl_spot_pk", [
      "document_id",
      "address",
      "token_index",
    ])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("hl_perps")
    .addColumn("document_id", "varchar(255)", (c) => c.notNull())
    .addColumn("address", "varchar(255)", (c) => c.notNull())
    .addColumn("coin", "varchar(64)", (c) => c.notNull())
    .addColumn("szi", amount, (c) => c.notNull())
    .addColumn("entry_px", amount, (c) => c.notNull())
    .addColumn("position_value", amount, (c) => c.notNull())
    .addColumn("unrealized_pnl", amount, (c) => c.notNull())
    .addPrimaryKeyConstraint("hl_perps_pk", ["document_id", "address", "coin"])
    .ifNotExists()
    .execute();
}
