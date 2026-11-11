/**
 * Ankr transaction objects in, ledger event rows out - the same
 * taxonomy the Etherscan and Blockscout mappers enforce, from a raw
 * EVM dialect: hex numbers everywhere, `status: "0x1"` for success,
 * and - the reason Ankr earns its place - each tx's log array already
 * embedded, so ERC-20 transfers need no second call. Ankr indexes no
 * internal traces, so contract-sent native moves are a known, named
 * gap of this provider, not a silent one.
 */
import { erc20Asset, nativeIdentifier } from "./decode.js";
import type { AnkrTx } from "./ankr.js";
import type { LedgerEventRow } from "./etherscan-rows.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function hexBig(value: string | undefined | null): bigint {
  if (typeof value !== "string") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function iso(hexTimestamp: string | undefined): string {
  const seconds = Number(hexBig(hexTimestamp));
  return new Date(seconds * 1000).toISOString();
}

function lower(address: string | null | undefined): string {
  return (address ?? "").toLowerCase();
}

/** The 20-byte address carried by a topic word, or "". */
function addressFromTopic(topic: string | undefined): string {
  return typeof topic === "string" && topic.length >= 64
    ? `0x${topic.toLowerCase().slice(-40)}`
    : "";
}

export function mapAnkrRows(
  chainId: number,
  address: string,
  input: { txs: AnkrTx[] },
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
    const hash = tx.hash ?? "";
    if (hash === "") continue;
    const from = lower(tx.from);
    const to = lower(tx.to);
    const sent = from === self;
    const received = to === self;
    const value = hexBig(tx.value);
    const ok = tx.status === "0x1";
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
      // The miner/sequencer gets paid whether the call worked or not.
      const fee = hexBig(tx.gasUsed) * hexBig(tx.gasPrice);
      if (fee > 0n) {
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
    for (const log of tx.logs ?? []) {
      if (log.removed === true) continue;
      const topics = log.topics ?? [];
      if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
      const amount = hexBig(log.data);
      if (amount <= 0n) continue;
      const fromAddr = addressFromTopic(topics[1]);
      const toAddr = addressFromTopic(topics[2]);
      const tokenSent = fromAddr === self;
      const tokenReceived = toAddr === self;
      if (!tokenSent && !tokenReceived) continue;
      push(hash, {
        eventIdentifier: hash,
        timestamp: iso(tx.timestamp),
        type: tokenSent ? "SPEND" : "RECEIVE",
        subtype: "NONE",
        asset: erc20Asset(chainId, (log.address ?? "").toLowerCase()),
        amount: amount.toString(),
        counterparty: tokenSent ? toAddr : fromAddr,
        notes: "token",
      });
    }
  }

  const events: LedgerEventRow[] = [];
  for (const rows of groups.values()) {
    rows.forEach((row, index) => {
      events.push({ ...row, sequenceIndex: index });
    });
  }
  return { events };
}
