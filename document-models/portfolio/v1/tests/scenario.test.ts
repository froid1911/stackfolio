import { actions, reducer, utils } from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const {
  setPortfolioDetails,
  addAddress,
  setPriceOverride,
  takeSnapshot,
  deleteSnapshot,
  recordResources,
  recordCheck,
  setGrant,
  clearGrant,
} = actions;

/** The setup wizard and reconciler flow over one portfolio document. */
describe("portfolio scenario", () => {
  it("goes from empty document to tracked, checked portfolio", () => {
    let document = reducer(
      utils.createDocument(),
      setPortfolioDetails({
        name: "Frank's stack",
        baseCurrency: "EUR",
        autoSnapshotEnabled: true,
        autoSnapshotIntervalHours: 24,
      }),
    );

    // The wizard tracks an ENS-resolved wallet on two chains.
    document = reducer(
      document,
      addAddress({
        id: "addr-main",
        address: "0x1F9840a85d5Af5bf1D1762F925BDADdC4201F984",
        chainId: 1,
        label: "frankp.eth",
        ensName: "frankp.eth",
        timestamp: "2026-11-11T00:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      addAddress({
        id: "addr-base",
        address: "0x1F9840a85d5Af5bf1D1762F925BDADdC4201F984",
        chainId: 8453,
        label: "frankp.eth (Base)",
        ensName: null,
        timestamp: "2026-11-11T00:00:00.000Z",
      }),
    );
    // A mis-click adds the same chain twice; the second is rejected.
    document = reducer(
      document,
      addAddress({
        id: "addr-dupe",
        address: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        chainId: 1,
        label: null,
        ensName: null,
        timestamp: "2026-11-11T00:00:00.000Z",
      }),
    );
    expect(document.operations.global[3].error).toContain("already tracked");

    document = reducer(
      document,
      setPriceOverride({
        asset: "eip155:1/slip44:60",
        price: "2950.10",
        setAt: "2026-11-11T10:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      takeSnapshot({
        id: "snap-day1",
        timestamp: "2026-11-11T23:00:00.000Z",
        totalValue: "5900.20",
        perLocation: [
          { location: "eip155:1", value: "5900.20" },
          { location: "eip155:8453", value: "0" },
        ],
        perAsset: [
          { asset: "eip155:1/slip44:60", amount: "2", value: "5900.20" },
        ],
      }),
    );
    // With history stored, the currency locks; deleting the snapshot frees it.
    document = reducer(
      document,
      setPortfolioDetails({ baseCurrency: "USD" }),
    );
    expect(document.operations.global[6].error).toBe(
      "Cannot change the base currency once snapshots exist",
    );
    document = reducer(document, deleteSnapshot({ id: "snap-day1" }));
    document = reducer(
      document,
      setPortfolioDetails({ baseCurrency: "USD" }),
    );
    expect(document.state.global.baseCurrency).toBe("USD");

    // The reconciler reports its wiring, a check, a grant and a revoke.
    document = reducer(
      document,
      recordResources({ connectionId: "conn-eth", workflowIds: ["wf-import"] }),
    );
    document = reducer(
      document,
      recordCheck({
        at: "2026-11-11T23:59:00.000Z",
        issues: [],
        fixes: [],
      }),
    );
    document = reducer(
      document,
      setGrant({ id: "grant-1", name: "reconciler", grantedAt: null }),
    );
    document = reducer(document, clearGrant({ _empty: true }));

    expect(document.operations.global).toHaveLength(13);
    const state = document.state.global;
    expect(state.addresses).toHaveLength(2);
    expect(state.snapshots).toHaveLength(0);
    expect(state.resources?.workflowIds).toEqual(["wf-import"]);
    expect(state.grant).toBeNull();
  });
});
