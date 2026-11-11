import type { EtherscanRow } from "./etherscan.js";

/**
 * The taxonomy brain: Etherscan rows in, ledger event rows out - the
 * exact shape `import-events-to-wallet-account` validates. The rules
 * live here, pure and total, so what counts as money is reviewable in
 * one file:
 *
 * - a transfer row per native value move (txs and real internal traces),
 *   the internal `msg.value` mirror (empty traceAddress) skipped so the
 *   top-level value is counted exactly once;
 * - one gas SPEND/FEE row per tx this address SENT (miners get paid even
 *   when the call reverts - the fee row survives failed txs);
 * - erc20 rows from tokentx with CAIP-19 ids;
 * - approvals as INFORMATIONAL/APPROVE - not money, but the record of
 *   money someone may move;
 * - `eventIdentifier = tx hash` and a deterministic sequenceIndex per
 *   hash, so re-imports dedupe and reruns are no-ops.
 */

const NATIVE_ASSET = "eip155:1/slip44:60";

export interface LedgerEventRow {
  eventIdentifier: string;
  sequenceIndex: number;
  timestamp: string;
  type: "SPEND" | "RECEIVE" | "INFORMATIONAL";
  subtype: "NONE" | "FEE" | "APPROVE";
  asset: string;
  amount: string;
  counterparty: string;
  notes?: string;
}

function unixToIso(seconds: string | undefined): string {
  return new Date(Number(seconds ?? "0") * 1000).toISOString();
}

function erc20Asset(contractAddress: string | undefined): string {
  return `eip155:1/erc20:${(contractAddress ?? "").toLowerCase()}`;
}

function lower(address: string | undefined): string {
  return (address ?? "").toLowerCase();
}

export function mapEtherscanRows(
  address: string,
  input: {
    txs: EtherscanRow[];
    internal: EtherscanRow[];
    tokentxs: EtherscanRow[];
    approvals?: EtherscanRow[];
  },
): { events: LedgerEventRow[] } {
  const self = lower(address);
  const groups = new Map<string, LedgerEventRow[]>();
  const push = (eventIdentifier: string, row: Omit<LedgerEventRow, "sequenceIndex">) => {
    const rows = groups.get(eventIdentifier) ?? [];
    if (!groups.has(eventIdentifier)) groups.set(eventIdentifier, rows);
    rows.push(row as LedgerEventRow);
  };

  for (const tx of input.txs) {
    const hash = tx.hash ?? "";
    if (hash === "") continue;
    const sent = lower(tx.from) === self;
    const received = lower(tx.to) === self;
    const value = BigInt(tx.value ?? "0");
    const ok = tx.status !== "0";
    if (ok && value > 0n && (sent || received)) {
      push(hash, {
        eventIdentifier: hash,
        timestamp: unixToIso(tx.timeStamp),
        type: sent ? "SPEND" : "RECEIVE",
        subtype: "NONE",
        asset: NATIVE_ASSET,
        amount: value.toString(),
        counterparty: lower(sent ? tx.to : tx.from),
      });
    }
    if (sent) {
      const fee =
        BigInt(tx.gasUsed ?? "0") * BigInt(tx.gasPrice ?? "0");
      push(hash, {
        eventIdentifier: hash,
        timestamp: unixToIso(tx.timeStamp),
        type: "SPEND",
        subtype: "FEE",
        asset: NATIVE_ASSET,
        amount: fee.toString(),
        counterparty: lower(tx.to),
        notes: "gas",
      });
    }
  }

  for (const trace of input.internal) {
    const hash = trace.hash ?? "";
    if (hash === "") continue;
    const traceAddress = (trace.traceAddress ?? "").trim();
    if (traceAddress === "" || traceAddress === "[]") continue;
    if ((trace.errValue ?? "").trim() !== "") continue;
    const value = BigInt(trace.value ?? "0");
    if (value <= 0n) continue;
    const sent = lower(trace.from) === self;
    const received = lower(trace.to) === self;
    if (!sent && !received) continue;
    push(hash, {
      eventIdentifier: hash,
      timestamp: unixToIso(trace.timeStamp),
      type: sent ? "SPEND" : "RECEIVE",
      subtype: "NONE",
      asset: NATIVE_ASSET,
      amount: value.toString(),
      counterparty: lower(sent ? trace.to : trace.from),
      notes: "internal",
    });
  }

  for (const row of input.tokentxs) {
    const hash = row.hash ?? "";
    if (hash === "") continue;
    const value = BigInt(row.value ?? "0");
    if (value <= 0n) continue;
    const sent = lower(row.from) === self;
    const received = lower(row.to) === self;
    if (!sent && !received) continue;
    push(hash, {
      eventIdentifier: hash,
      timestamp: unixToIso(row.timeStamp),
      type: sent ? "SPEND" : "RECEIVE",
      subtype: "NONE",
      asset: erc20Asset(row.contractAddress),
      amount: value.toString(),
      counterparty: lower(sent ? row.to : row.from),
    });
  }

  for (const row of input.approvals ?? []) {
    const hash = row.transactionHash ?? "";
    if (hash === "") continue;
    push(hash, {
      eventIdentifier: hash,
      timestamp: unixToIso(row.approvalDate ?? row.timeStamp),
      type: "INFORMATIONAL",
      subtype: "APPROVE",
      asset: erc20Asset(row.tokenContract ?? row.tokenContractAddress),
      amount: row.value ?? "0",
      counterparty: lower(row.spender),
      notes: row.tokenSymbol ?? row.tokenName ?? undefined,
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
