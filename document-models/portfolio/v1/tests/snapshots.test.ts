import { actions, reducer, utils } from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const { takeSnapshot, deleteSnapshot } = actions;

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
    const document = reducer(utils.createDocument(), takeSnapshot(validInput()));

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.snapshots).toHaveLength(1);
    expect(document.state.global.snapshots[0].totalValue).toBe("1000");
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
      { perLocation: [{ location: "eip155:1", value: "-5" }] },
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
