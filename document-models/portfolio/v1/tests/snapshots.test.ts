import {
  deleteSnapshot,
  reducer,
  takeSnapshot,
  utils,
} from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const validInput = (overrides: Record<string, unknown> = {}) => ({
  id: "snap-1",
  timestamp: "2026-11-11T00:00:00.000Z",
  totalValue: "1000",
  perLocation: [{ location: "eip155:1", value: "1000" }],
  perAsset: [{ asset: "eip155:1/slip44:60", amount: "1.5", value: "1000" }],
  ...overrides,
});

describe("SnapshotOperations", () => {
  it("should handle takeSnapshot operation", () => {
    const document = reducer(
      utils.createDocument(),
      takeSnapshot(validInput()),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.snapshots).toHaveLength(1);
    expect(document.state.global.snapshots[0].totalValue).toBe("1000");
  });

  it("replaces the stored snapshot when a re-run retakes its id", () => {
    let document = reducer(utils.createDocument(), takeSnapshot(validInput()));
    document = reducer(
      document,
      takeSnapshot(validInput({ totalValue: "1100" })),
    );

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.snapshots).toHaveLength(1);
    expect(document.state.global.snapshots[0].totalValue).toBe("1100");
  });

  it("keeps other snapshots when one id is retaken", () => {
    let document = reducer(utils.createDocument(), takeSnapshot(validInput()));
    document = reducer(
      document,
      takeSnapshot(validInput({ id: "snap-2", timestamp: "2026-11-12T00:00:00.000Z" })),
    );
    document = reducer(document, takeSnapshot(validInput({ totalValue: "1100" })));

    expect(document.state.global.snapshots).toHaveLength(2);
    expect(document.state.global.snapshots[0].totalValue).toBe("1100");
    expect(document.state.global.snapshots[1].id).toBe("snap-2");
  });

  it("should handle deleteSnapshot operation", () => {
    let document = reducer(utils.createDocument(), takeSnapshot(validInput()));
    document = reducer(document, deleteSnapshot({ id: "snap-1" }));

    expect(document.operations.global[1].error).toBeUndefined();
    expect(document.state.global.snapshots).toHaveLength(0);
  });

  it("should reject a snapshot without any values", () => {
    const document = reducer(
      utils.createDocument(),
      takeSnapshot(validInput({ perLocation: [], perAsset: [] })),
    );

    expect(document.operations.global[0].error).toBe(
      "A snapshot needs at least one location or asset value",
    );
  });

  it("should reject non-decimal snapshot amounts", () => {
    const cases: Array<Record<string, unknown>> = [
      { totalValue: "many" },
      { perLocation: [{ location: "eip155:1", value: "-5.5.5" }] },
      {
        perAsset: [
          { asset: "eip155:1/slip44:60", amount: "1,5", value: "1000" },
        ],
      },
    ];
    for (const override of cases) {
      const document = reducer(
        utils.createDocument(),
        takeSnapshot(validInput(override)),
      );
      expect(document.operations.global[0].error).toContain(
        "is not a decimal amount",
      );
    }
  });

  it("should record a negative holding (ledger without full inflow coverage)", () => {
    const document = reducer(
      utils.createDocument(),
      takeSnapshot(
        validInput({
          totalValue: "-7.5",
          perAsset: [
            {
              asset:
                "eip155:1/erc20:0xc12d1c73ee7dc3615ba4e37e4ab7e05f8f4e1e3b",
              amount: "-4.543350290722074076",
              value: "-7.5",
            },
          ],
        }),
      ),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.snapshots[0].perAsset[0].amount).toBe(
      "-4.543350290722074076",
    );
  });

  it("should store liabilities and net worth", () => {
    const document = reducer(
      utils.createDocument(),
      takeSnapshot(
        validInput({
          liabilities: [
            { asset: "eip155:1/erc20:0xa0b866", amount: "1500.25" },
          ],
          netWorth: "949.75",
        }),
      ),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    const snapshot = document.state.global.snapshots[0];
    expect(snapshot.liabilities).toEqual([
      { asset: "eip155:1/erc20:0xa0b866", amount: "1500.25" },
    ]);
    expect(snapshot.netWorth).toBe("949.75");
  });

  it("should default liabilities and net worth when absent", () => {
    const document = reducer(
      utils.createDocument(),
      takeSnapshot(validInput()),
    );

    const snapshot = document.state.global.snapshots[0];
    expect(snapshot.liabilities).toEqual([]);
    expect(snapshot.netWorth).toBeNull();
  });

  it("should reject non-decimal liability and net worth amounts", () => {
    const cases: Array<Record<string, unknown>> = [
      { liabilities: [{ asset: "a", amount: "-3" }] },
      { netWorth: "1.2.3" },
    ];
    for (const override of cases) {
      const document = reducer(
        utils.createDocument(),
        takeSnapshot(validInput(override)),
      );
      expect(document.operations.global[0].error).toContain(
        "is not a decimal amount",
      );
    }
  });

  it("should allow a negative net worth (more debt than assets)", () => {
    const document = reducer(
      utils.createDocument(),
      takeSnapshot(
        validInput({
          liabilities: [{ asset: "a", amount: "2000" }],
          netWorth: "-1000",
        }),
      ),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.snapshots[0].netWorth).toBe("-1000");
  });

  it("should reject deleting an unknown snapshot", () => {
    const document = reducer(
      utils.createDocument(),
      deleteSnapshot({ id: "nope" }),
    );

    expect(document.operations.global[0].error).toBe(
      "Snapshot nope does not exist",
    );
  });
});
