import {
  importEvents,
  pinValuations,
  reducer,
  setEnsNames,
  utils,
} from "document-models/wallet-account/v1";
import { describe, expect, it } from "vitest";

const oracle = {
  unit: "EUR",
  price: "3000.00",
  source: "COINGECKO",
  granularity: "DAY",
  pinnedAt: "2026-11-12T00:00:00.000Z",
} as const;

const manual = {
  ...oracle,
  price: "2999.5",
  source: "MANUAL",
  granularity: "NONE",
} as const;

/** A ledger with one event `evt-1` at sequence index 0. */
const withEvent = () =>
  reducer(
    utils.createDocument(),
    importEvents({
      batchId: "run-1",
      importedAt: "2026-11-11T00:00:00.000Z",
      events: [
        {
          id: "evt-1",
          eventIdentifier: "0xdeadbeef-1",
          sequenceIndex: 0,
          timestamp: "2026-11-10T12:00:00.000Z",
          type: "SPEND",
          subtype: "NONE",
          asset: "eip155:1/slip44:60",
          amount: "1.5",
        },
      ],
    }),
  );

type Val = {
  readonly unit: string;
  readonly price: string;
  readonly source: "COINGECKO" | "MANUAL";
  readonly granularity: "DAY" | "NONE";
  readonly pinnedAt: string;
};

const pin = (valuation: Val, id = "evt-1", sequenceIndex = 0) =>
  pinValuations({ events: [{ id, sequenceIndex, valuation }] });

describe("PIN_VALUATIONS", () => {
  it("attaches a valuation to the addressed row", () => {
    const document = reducer(withEvent(), pin(oracle));
    const operation = document.operations.global[1];
    expect(operation.error).toBeUndefined();
    expect(document.state.global.ledger[0].valuation).toEqual(oracle);
  });

  it("never overwrites a manual valuation with an oracle value", () => {
    const document = reducer(reducer(withEvent(), pin(manual)), pin(oracle));
    const valuation = document.state.global.ledger[0].valuation;
    expect(valuation?.source).toBe("MANUAL");
    expect(valuation?.price).toBe("2999.5");
  });

  it("lets a manual valuation replace an oracle one", () => {
    const document = reducer(reducer(withEvent(), pin(oracle)), pin(manual));
    expect(document.state.global.ledger[0].valuation?.source).toBe("MANUAL");
  });

  it("ignores pins for rows that are not in the ledger", () => {
    const document = reducer(withEvent(), pin(oracle, "evt-404", 3));
    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.ledger[0].valuation).toBeNull();
  });

  it("rejects a batch with a non-decimal price atomically", () => {
    const document = reducer(
      withEvent(),
      pinValuations({
        events: [
          { id: "evt-1", sequenceIndex: 0, valuation: oracle },
          { id: "evt-2", sequenceIndex: 0, valuation: { ...oracle, price: "NaN" } },
        ],
      }),
    );
    expect(document.operations.global[1].error).toBeDefined();
    expect(document.state.global.ledger[0].valuation).toBeNull();
  });
});

describe("SET_ENS_NAMES", () => {
  it("stores lowercased names and replaces the full list", () => {
    let document = reducer(
      withEvent(),
      setEnsNames({ names: [{ name: "FrankP.ETH", owned: true }] }),
    );
    document = reducer(
      document,
      setEnsNames({
        names: [
          { name: "fr4nk.eth", owned: true },
          { name: "vitalik.eth", owned: false },
        ],
      }),
    );
    expect(document.state.global.ensNames).toEqual([
      { name: "fr4nk.eth", owned: true },
      { name: "vitalik.eth", owned: false },
    ]);
  });
});
