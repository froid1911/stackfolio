/**
 * mempool.space transactions in, ledger rows out - the same taxonomy the
 * Etherscan and Blockscout paths enforce, in UTXO accounting.
 *
 * A transaction has no per-output sender, so the wallet's side is the
 * net of its addresses: inputs it owns spend, outputs it owns receive,
 * and the transaction is one ledger event (`eventIdentifier` = txid)
 * with a value row plus the miner-fee row when the wallet paid the fee.
 * Self-transfers net to zero and land as one INFORMATIONAL row, exactly
 * where the Etherscan path files internal moves. Unconfirmed transactions
 * produce no rows - their timestamp does not exist yet and the ledger id
 * is the transaction, so an early import would freeze a pending row.
 */
import type { LedgerEventRow } from "./etherscan-rows.js";
import type { BitcoinTx } from "./bitcoin.js";

function ownInputTotal(tx: BitcoinTx, own: Set<string>): bigint {
  let total = 0n;
  for (const input of tx.vin) {
    const address = input.prevout?.scriptpubkey_address ?? "";
    if (own.has(address)) total += BigInt(input.prevout?.value ?? 0);
  }
  return total;
}

function ownOutputTotal(tx: BitcoinTx, own: Set<string>): bigint {
  let total = 0n;
  for (const output of tx.vout) {
    if (own.has(output.scriptpubkey_address ?? "")) total += BigInt(output.value);
  }
  return total;
}

function firstWhere<T>(items: T[], predicate: (item: T) => boolean, pick: (item: T) => string): string {
  for (const item of items) {
    if (predicate(item)) return pick(item);
  }
  return "";
}

/**
 * Rows for one transaction against the wallet's address set. Rows come
 * back without `sequenceIndex`; the caller numbers them per txid, like
 * the other mappers.
 */
export function mapBitcoinTxRows(
  tx: BitcoinTx,
  own: Set<string>,
  asset: string,
): Omit<LedgerEventRow, "sequenceIndex">[] {
  const height = tx.status.block_height;
  const time = tx.status.block_time;
  if (!tx.status.confirmed || height === undefined || time === undefined) return [];

  const spent = ownInputTotal(tx, own);
  const received = ownOutputTotal(tx, own);
  if (spent === 0n && received === 0n) return [];

  // The whole-transaction fee, computable only when every input carries
  // its prevout; the wallet's own outflow is then what its inputs brought
  // minus its change minus the fee - the EVM taxonomy's value-row-excludes-
  // gas rule in UTXO terms.
  const feeKnown = tx.vin.every((input) => input.prevout != null);
  const fee = feeKnown
    ? tx.vin.reduce((sum, input) => sum + BigInt(input.prevout?.value ?? 0), 0n) -
      tx.vout.reduce((sum, output) => sum + BigInt(output.value), 0n)
    : null;

  const timestamp = new Date(time * 1000).toISOString();
  const rows: Omit<LedgerEventRow, "sequenceIndex">[] = [];
  const externalOutputs = tx.vout.filter((output) => !own.has(output.scriptpubkey_address ?? ""));

  if (spent === 0n) {
    rows.push({
      eventIdentifier: tx.txid,
      timestamp,
      type: "RECEIVE",
      subtype: "NONE",
      asset,
      amount: received.toString(),
      counterparty: firstWhere(
        tx.vin,
        (input) => {
          const address = input.prevout?.scriptpubkey_address ?? "";
          return address !== "" && !own.has(address);
        },
        (input) => input.prevout?.scriptpubkey_address ?? "",
      ),
    });
  } else if (externalOutputs.length === 0) {
    rows.push({
      eventIdentifier: tx.txid,
      timestamp,
      type: "INFORMATIONAL",
      subtype: "NONE",
      asset,
      amount: received.toString(),
      counterparty: "",
      notes: "internal move",
    });
  } else {
    const outflow = spent - received - (fee ?? 0n);
    if (outflow > 0n) {
      rows.push({
        eventIdentifier: tx.txid,
        timestamp,
        type: "SPEND",
        subtype: "NONE",
        asset,
        amount: outflow.toString(),
        counterparty: firstWhere(
          externalOutputs,
          (output) => (output.scriptpubkey_address ?? "") !== "",
          (output) => output.scriptpubkey_address ?? "",
        ),
      });
    }
  }

  if (spent > 0n && feeKnown && fee !== null && fee > 0n) {
    // The wallet helped pay: explorers attribute the whole fee, and the
    // overcount only occurs on mixed-input transactions the wallet did
    // not build - the documented approximation.
    rows.push({
      eventIdentifier: tx.txid,
      timestamp,
      type: "SPEND",
      subtype: "FEE",
      asset,
      amount: fee.toString(),
      counterparty: "",
      notes: "fee",
    });
  }
  return rows;
}

/**
 * Map a batch of transactions - any order, any overlap (the same txid
 * seen through two of the wallet's addresses) - to sequenced rows.
 * Transaction order is preserved; duplicates collapse.
 */
export function mapBitcoinRows(
  txs: BitcoinTx[],
  own: Set<string>,
  asset: string,
): { events: LedgerEventRow[] } {
  const seen = new Set<string>();
  const events: LedgerEventRow[] = [];
  for (const tx of txs) {
    if (seen.has(tx.txid)) continue;
    seen.add(tx.txid);
    const rows = mapBitcoinTxRows(tx, own, asset);
    rows.forEach((row, index) => {
      events.push({ ...row, sequenceIndex: index });
    });
  }
  return { events };
}
