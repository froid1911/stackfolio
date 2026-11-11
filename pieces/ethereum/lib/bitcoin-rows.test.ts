import { describe, expect, it } from "vitest";
import { mapBitcoinRows, mapBitcoinTxRows } from "./bitcoin-rows.js";
import type { BitcoinTx } from "./bitcoin.js";

const OWN = "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl";
const OWN_CHANGE = "tb1q9u62588spffmq4dzjxsr5l297znf3z6j5p2688";
const OTHER = "tb1qd7spv5q28348xl4myc8zmh983w5jx32cjhkn97";
const ASSET = "bip122:000000000933ea01ad0ee984209779ba/slip44:1";
const OWNERS = new Set([OWN, OWN_CHANGE]);

const confirmed = (height: number, time: number): BitcoinTx["status"] => ({
  confirmed: true,
  block_height: height,
  block_time: time,
});

const input = (address: string, value: number) => ({
  prevout: { scriptpubkey_address: address, value },
});
const output = (address: string, value: number) => ({
  scriptpubkey_address: address,
  value,
});

describe("mapBitcoinTxRows", () => {
  it("files a pure deposit as RECEIVE with the external sender", () => {
    const tx: BitcoinTx = {
      txid: "aa01",
      status: confirmed(100, 1_700_000_000),
      vin: [input(OTHER, 9_000)],
      vout: [output(OWN, 8_000), output(OTHER, 1_000)],
    };
    const rows = mapBitcoinTxRows(tx, OWNERS, ASSET);
    expect(rows).toHaveLength(1); // no fee row: the wallet paid nothing
    expect(rows[0]).toMatchObject({
      eventIdentifier: "aa01",
      type: "RECEIVE",
      subtype: "NONE",
      amount: "8000",
      counterparty: OTHER,
      asset: ASSET,
    });
  });

  it("files the external part of a spend and the miner fee separately", () => {
    const tx: BitcoinTx = {
      txid: "bb02",
      status: confirmed(101, 1_700_000_060),
      vin: [input(OWN, 10_000)],
      vout: [output(OTHER, 6_000), output(OWN, 3_900)],
    };
    const rows = mapBitcoinTxRows(tx, OWNERS, ASSET);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: "SPEND",
      subtype: "NONE",
      amount: "6000", // spent 10000 - change 3900 - fee 100
      counterparty: OTHER,
    });
    expect(rows[1]).toMatchObject({
      type: "SPEND",
      subtype: "FEE",
      amount: "100",
      notes: "fee",
    });
  });

  it("files self-transfers as one informational move", () => {
    const tx: BitcoinTx = {
      txid: "cc03",
      status: confirmed(102, 1_700_000_120),
      vin: [input(OWN, 5_000)],
      vout: [output(OWN_CHANGE, 4_900)],
    };
    const rows = mapBitcoinTxRows(tx, OWNERS, ASSET);
    expect(rows[0]).toMatchObject({
      type: "INFORMATIONAL",
      amount: "4900",
      notes: "internal move",
      counterparty: "",
    });
    expect(rows[1]).toMatchObject({ subtype: "FEE", amount: "100" });
  });

  it("answers nothing for unconfirmed or untouched transactions", () => {
    const pending: BitcoinTx = {
      txid: "dd04",
      status: { confirmed: false },
      vin: [input(OTHER, 10)],
      vout: [output(OWN, 10)],
    };
    const untouched: BitcoinTx = {
      txid: "ee05",
      status: confirmed(103, 1_700_000_180),
      vin: [input(OTHER, 20)],
      vout: [output("tb1qother9999999999999999999999999999999999", 20)],
    };
    expect(mapBitcoinTxRows(pending, OWNERS, ASSET)).toEqual([]);
    expect(mapBitcoinTxRows(untouched, OWNERS, ASSET)).toEqual([]);
  });

  it("skips the fee row when an input has no prevout to price it", () => {
    const tx: BitcoinTx = {
      txid: "ff06",
      status: confirmed(104, 1_700_000_240),
      vin: [{ prevout: null }, input(OWN, 7_000)],
      vout: [output(OTHER, 6_500)],
    };
    const rows = mapBitcoinTxRows(tx, OWNERS, ASSET);
    expect(rows.some((row) => row.subtype === "FEE")).toBe(false);
    // Without the unknown-prevout input the outflow carries the fee:
    // the wallet lost exactly what its priced input brought.
    expect(rows[0]).toMatchObject({ type: "SPEND", amount: "7000" });
  });
});

describe("mapBitcoinRows", () => {
  it("collapses a txid seen through two wallet addresses", () => {
    const tx: BitcoinTx = {
      txid: "aa01",
      status: confirmed(100, 1_700_000_000),
      vin: [input(OTHER, 9_000)],
      vout: [output(OWN, 4_000), output(OWN_CHANGE, 4_000)],
    };
    const { events } = mapBitcoinRows([tx, tx], OWNERS, ASSET);
    expect(events).toHaveLength(1);
  });

  it("numbers rows per txid and keeps transaction order", () => {
    const spend: BitcoinTx = {
      txid: "bb02",
      status: confirmed(101, 1_700_000_060),
      vin: [input(OWN, 10_000)],
      vout: [output(OTHER, 6_000), output(OWN, 3_900)],
    };
    const receive: BitcoinTx = {
      txid: "aa01",
      status: confirmed(100, 1_700_000_000),
      vin: [input(OTHER, 8_000)],
      vout: [output(OWN, 8_000)],
    };
    const { events } = mapBitcoinRows([spend, receive], OWNERS, ASSET);
    expect(events.map((row) => [row.eventIdentifier, row.sequenceIndex])).toEqual([
      ["bb02", 0],
      ["bb02", 1],
      ["aa01", 0],
    ]);
  });
});
