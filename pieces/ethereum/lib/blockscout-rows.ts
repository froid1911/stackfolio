/**
 * Blockscout API v2 items in, ledger event rows out - the same
 * taxonomy `etherscan-rows` enforces, from a different JSON dialect:
 * addresses are objects, timestamps are ISO, fees are precomputed.
 * Internal traces and ERC-20 transfers come from their own endpoints;
 * NFT transfers are skipped exactly as the Etherscan path skips them.
 */
import { erc20Asset, nativeIdentifier } from "./decode.js";
import type { LedgerEventRow } from "./etherscan-rows.js";

type Addr = { hash?: string } | null | undefined;

function lower(address: Addr): string {
  return (address?.hash ?? "").toLowerCase();
}

function iso(seconds: unknown): string {
  const text = typeof seconds === "string" ? seconds : "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? new Date(0).toISOString()
    : parsed.toISOString();
}

function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

export function mapBlockscoutRows(
  chainId: number,
  address: string,
  input: {
    txs: Record<string, unknown>[];
    internal: Record<string, unknown>[];
    transfers: Record<string, unknown>[];
  },
): { events: LedgerEventRow[] } {
  const self = (address ?? "").toLowerCase();
  const nativeAsset = nativeIdentifier(chainId);
  const groups = new Map<string, LedgerEventRow[]>();
  const push = (
    eventIdentifier: string,
    row: Omit<LedgerEventRow, "sequenceIndex">,
  ) => {
    const rows = groups.get(eventIdentifier) ?? [];
    if (!groups.has(eventIdentifier)) groups.set(eventIdentifier, rows);
    rows.push(row as LedgerEventRow);
  };

  for (const tx of input.txs) {
    const hash = str(tx.hash);
    if (hash === "") continue;
    const from = lower(tx.from as Addr);
    const to = lower(tx.to as Addr);
    const sent = from === self;
    const received = to === self;
    const value = BigInt(str(tx.value) || "0");
    const ok = str(tx.status) === "ok" || str(tx.result) === "ok";
    if (ok && value > 0n && (sent || received)) {
      push(hash, {
        eventIdentifier: hash,
        timestamp: iso(tx.timestamp),
        type: sent ? "SPEND" : "RECEIVE",
        subtype: "NONE",
        asset: nativeAsset,
        amount: value.toString(),
        counterparty: sent ? to : from,
      });
    }
    if (sent) {
      // Blockscout precomputes the total fee; fall back to gas math.
      const fee =
        str(tx.fee) !== ""
          ? BigInt(str(tx.fee))
          : BigInt(str(tx.gas_used) || "0") * BigInt(str(tx.gas_price) || "0");
      push(hash, {
        eventIdentifier: hash,
        timestamp: iso(tx.timestamp),
        type: "SPEND",
        subtype: "FEE",
        asset: nativeAsset,
        amount: fee.toString(),
        counterparty: to,
        notes: "gas",
      });
    }
  }

  for (const trace of input.internal) {
    const hash = str(trace.transaction_hash);
    if (hash === "") continue;
    const value = BigInt(str(trace.value) || "0");
    if (value <= 0n) continue;
    const from = lower(trace.from as Addr);
    const to = lower(trace.to as Addr);
    const sent = from === self;
    const received = to === self;
    if (!sent && !received) continue;
    push(hash, {
      eventIdentifier: hash,
      timestamp: iso(trace.timestamp),
      type: sent ? "SPEND" : "RECEIVE",
      subtype: "NONE",
      asset: nativeAsset,
      amount: value.toString(),
      counterparty: sent ? to : from,
      notes: "internal",
    });
  }

  for (const row of input.transfers) {
    const hash = str(row.transaction_hash);
    if (hash === "") continue;
    const type = str(row.type);
    if (type !== "" && type !== "ERC-20") continue;
    const total = (row.total ?? {}) as Record<string, unknown>;
    const value = BigInt(str(total.value) || "0");
    if (value <= 0n) continue;
    const from = lower(row.from as Addr);
    const to = lower(row.to as Addr);
    const sent = from === self;
    const received = to === self;
    if (!sent && !received) continue;
    const token = (row.token ?? {}) as Record<string, unknown>;
    push(hash, {
      eventIdentifier: hash,
      timestamp: iso(row.timestamp),
      type: sent ? "SPEND" : "RECEIVE",
      subtype: "NONE",
      asset: erc20Asset(chainId, str(token.address_hash)),
      amount: value.toString(),
      counterparty: sent ? to : from,
    });
  }

  const events: LedgerEventRow[] = [];
  for (const rows of groups.values()) {
    rows.forEach((row, index) => {
      events.push({ ...row, sequenceIndex: index });
    });
  }
  return { events };
}
