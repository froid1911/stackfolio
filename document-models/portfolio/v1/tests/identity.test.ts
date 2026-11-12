import {
  actions,
  reducer,
  setPortfolioDetails,
  utils,
} from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const { takeSnapshot } = actions;

const snapshotInput = (id: string) => ({
  id,
  timestamp: "2026-11-11T00:00:00.000Z",
  totalValue: "1000",
  perLocation: [{ location: "eip155:1", value: "1000" }],
  perAsset: [{ asset: "eip155:1/slip44:60", amount: "1.5", value: "1000" }],
});

describe("IdentityOperations", () => {
  it("should handle setPortfolioDetails operation", () => {
    const document = reducer(
      utils.createDocument(),
      setPortfolioDetails({
        name: "Main stack",
        baseCurrency: "USD",
        autoSnapshotEnabled: true,
        autoSnapshotIntervalHours: 6,
      }),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.name).toBe("Main stack");
    expect(document.state.global.baseCurrency).toBe("USD");
    expect(document.state.global.autoSnapshot).toEqual({
      enabled: true,
      intervalHours: 6,
    });
  });

  it("should reject a currency that is not 3 letters", () => {
    const document = reducer(
      utils.createDocument(),
      setPortfolioDetails({ baseCurrency: "euros" }),
    );

    expect(document.operations.global[0].error).toBe(
      "euros is not a 3-letter currency code",
    );
    expect(document.state.global.baseCurrency).toBe("EUR");
  });

  it("should reject changing the currency once a snapshot exists", () => {
    let document = reducer(
      utils.createDocument(),
      takeSnapshot(snapshotInput("s1")),
    );
    document = reducer(document, setPortfolioDetails({ baseCurrency: "USD" }));

    expect(document.operations.global[1].error).toBe(
      "Cannot change the base currency once snapshots exist",
    );
    expect(document.state.global.baseCurrency).toBe("EUR");
  });

  it("should allow restating the same currency after a snapshot", () => {
    let document = reducer(
      utils.createDocument(),
      takeSnapshot(snapshotInput("s1")),
    );
    document = reducer(
      document,
      setPortfolioDetails({ baseCurrency: "EUR", name: "Renamed" }),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.name).toBe("Renamed");
  });

  it("should apply a single field and leave the rest alone", () => {
    const document = reducer(
      utils.createDocument(),
      setPortfolioDetails({ name: "Only the name" }),
    );

    expect(document.state.global.baseCurrency).toBe("EUR");
    expect(document.state.global.autoSnapshot).toEqual({
      enabled: false,
      intervalHours: 24,
    });
  });
});
