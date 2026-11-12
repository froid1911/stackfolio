import type { ChainIndex, EventSemantic } from "./manifest.js";
import { PLUGIN, type PluginInput } from "./plugins/index.js";
import {
  amountFromData,
  erc20Asset,
  hasAmountPayload,
  NATIVE_ASSET,
  TRANSFER_TOPIC,
} from "./decode.js";
import type { EventRow } from "./types.js";

/** A log as it appears inside a receipt. */
export interface ReceiptLogLike {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
}

/** A mined transaction narrowed to what decoding needs: viem's formatted
 * receipt plus the block timestamp and the tx's native value — rows carry a
 * timestamp, and ENS-style fees ride on the value, which no log reports. */
export interface ReceiptLike {
  hash: string;
  to: string | null;
  /** Wei, decimal or hex string. */
  value: string;
  /** ISO timestamp of the receipt's block. */
  timestamp: string;
  logs: ReceiptLogLike[];
}

export interface DecodeResult {
  /** Rows replacing whatever a generic import would book for the decoded
   * transactions: every account leg of a decoded tx, with semantic rows
   * among them. */
  rows: EventRow[];
  /** Hashes whose generic rows the caller must drop in favour of `rows`. */
  decodedTxHashes: string[];
  /** Protocols matched by address whose plugin is not deployed; their txs
   * stay generic rather than import under a guessed meaning. */
  inert: number;
}

interface Leg extends EventRow {
  logIndex: number;
  claimed: boolean;
}

const addressFromTopic = (topic: string): string =>
  `0x${topic.toLowerCase().slice(-40)}`;

const dataWords = (data: string): bigint[] => {
  const body = data.toLowerCase().replace(/^0x/, "");
  const words: bigint[] = [];
  for (let i = 0; i + 64 <= body.length; i += 64) {
    try {
      words.push(BigInt(`0x${body.slice(i, i + 64)}`));
    } catch {
      /* not a number - not an amount candidate */
    }
  }
  return words;
};

/** The account's Transfer legs of a receipt, in log order. A self-transfer
 * books once as a SPEND, matching decode.ts. */
function legsOf(receipt: ReceiptLike, account: string, chainId: number): Leg[] {
  const wanted = account.toLowerCase();
  const legs: Leg[] = [];
  for (const log of receipt.logs) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (!hasAmountPayload(log.data)) continue;
    const from = log.topics[1] ? addressFromTopic(log.topics[1]) : null;
    const to = log.topics[2] ? addressFromTopic(log.topics[2]) : null;
    const isSpend = from === wanted;
    const isReceive = to === wanted;
    if (!isSpend && !isReceive) continue;
    const counterparty = isSpend ? (to ?? from) : (from ?? to);
    legs.push({
      eventIdentifier: `${receipt.hash}-${log.logIndex}`,
      sequenceIndex: log.logIndex,
      timestamp: receipt.timestamp,
      type: isSpend ? "SPEND" : "RECEIVE",
      subtype: "NONE",
      asset: erc20Asset(chainId, log.address),
      amount: amountFromData(log.data),
      counterparty: counterparty ?? wanted,
      notes: null,
      logIndex: log.logIndex,
      claimed: false,
    });
  }
  return legs;
}

/**
 * Decode mined receipts against the chain's registry.
 *
 * A protocol is a candidate for a receipt when one of its contracts emits a
 * log or the transaction is sent to one. A candidate with an undeployed
 * plugin is inert — nothing is claimed. Otherwise each matched protocol event
 * either runs its plugin or attaches by rule: `TRADE` claims every leg (a
 * swap's legs are all trade legs), any other semantic claims the leg whose
 * direction matches and whose amount equals the event's first data word (the
 * exact reserve amount in Aave-style events); a semantic that found no leg
 * and whose value left the account as native ether becomes a synthesized
 * row — that is how ENS registrations book.
 */
export function decodeReceipts(
  index: ChainIndex,
  chainId: number,
  account: string,
  receipts: ReceiptLike[],
): DecodeResult {
  const rows: EventRow[] = [];
  const decodedTxHashes: string[] = [];
  let inert = 0;

  for (const receipt of receipts) {
    const emitting = new Set(
      receipt.logs.map((log) => log.address.toLowerCase()),
    );
    const target = receipt.to?.toLowerCase() ?? null;
    const candidates = index.protocols.filter((protocol) => {
      const chain = protocol.chains.find((entry) => entry.chainId === chainId);
      if (!chain) return false;
      return chain.contracts.some(
        (contract) =>
          emitting.has(contract.address.toLowerCase()) ||
          (target !== null && contract.address.toLowerCase() === target),
      );
    });
    if (candidates.length === 0) continue;

    const legs = legsOf(receipt, account, chainId);
    let decoded = false;

    for (const protocol of candidates) {
      const missing = protocol.plugins.find((name) => !(name in PLUGIN));
      if (missing) {
        inert += 1;
        continue;
      }
      const chain = protocol.chains.find((entry) => entry.chainId === chainId);
      if (!chain) continue;
      const rules = new Map(
        chain.events.map((event) => [event.topic.toLowerCase(), event]),
      );
      const matches = receipt.logs
        .map((log) => ({
          log,
          rule: rules.get(log.topics[0]?.toLowerCase() ?? ""),
        }))
        .filter((entry) => entry.rule !== undefined);
      if (matches.length === 0) continue;

      const input: PluginInput = {
        receipt,
        account: account.toLowerCase(),
        chainId,
        legs: legs.map(({ logIndex: _logIndex, claimed: _claimed, ...row }) => row),
      };
      const plugin = protocol.plugins[0] ? PLUGIN[protocol.plugins[0]] : undefined;
      const produced = plugin ? plugin(input) : null;

      if (Array.isArray(produced)) {
        rows.push(...produced);
        decoded = true;
        break;
      }

      for (const { log, rule } of matches) {
        const semantic: EventSemantic = rule!.semantic;
        if (semantic.type === "TRADE") {
          for (const leg of legs) {
            if (leg.claimed) continue;
            // Keep the leg's SPEND/RECEIVE direction: the ledger has no
            // other way to say which side of the swap it is. The pairing
            // is the shared eventIdentifier; the protocol tag is the note.
            leg.subtype = semantic.subtype;
            leg.counterparty = protocol.id;
            leg.claimed = true;
            decoded = true;
          }
          continue;
        }
        const wantSpend = semantic.type === "SPEND";
        const amounts = dataWords(log.data);
        const leg =
          legs.find(
            (entry) =>
              !entry.claimed &&
              (entry.type === "SPEND") === wantSpend &&
              amounts.some((word) => word === BigInt(entry.amount)),
          ) ??
          legs.find(
            (entry) => !entry.claimed && (entry.type === "SPEND") === wantSpend,
          );
        if (leg) {
          leg.type = semantic.type;
          leg.subtype = semantic.subtype;
          leg.counterparty = protocol.id;
          leg.claimed = true;
          decoded = true;
          continue;
        }
        const value = BigInt(receipt.value ?? "0");
        if (wantSpend && value > 0n && target) {
          rows.push({
            eventIdentifier: `${receipt.hash}-${log.logIndex}`,
            sequenceIndex: log.logIndex,
            timestamp: receipt.timestamp,
            type: semantic.type,
            subtype: semantic.subtype,
            asset: NATIVE_ASSET,
            amount: value.toString(),
            counterparty: protocol.id,
            notes: null,
          });
          decoded = true;
        }
      }
      if (decoded) break;
    }

    if (decoded) {
      decodedTxHashes.push(receipt.hash);
      for (const leg of legs) {
        const { logIndex: _logIndex, claimed: _claimed, ...row } = leg;
        rows.push(row);
      }
    }
  }

  return { rows, decodedTxHashes, inert };
}
