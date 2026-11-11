import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumSnapshotPortfolioAction } from "./snapshot-portfolio.js";

const get = vi.fn();
const execute = vi.fn();

const ETH = "eip155:1/slip44:60";
const USDC = "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const POLY = "eip155:137/erc20:0x0000000000000000000000000000000000001010";

const run = (holdings: unknown) =>
  ethereumSnapshotPortfolioAction.run({
    propsValue: {
      portfolioDocumentId: "p1",
      holdingsJson: JSON.stringify(holdings),
      snapshotId: "snap-1",
      timestamp: "2026-11-11T00:00:00.000Z",
    },
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<
    typeof ethereumSnapshotPortfolioAction.run
  >[0]);

beforeEach(() => {
  get.mockReset();
  execute.mockReset();
  execute.mockResolvedValue({});
  get.mockResolvedValue({
    header: { documentId: "p1", documentType: "stackfolio/portfolio" },
    state: { global: {} },
  });
});

describe("snapshot-portfolio", () => {
  it("snapshots priced rows grouped by chain", async () => {
    const result = (await run({
      holdings: [
        { asset: ETH, amount: "2.499979", value: "4999.958" },
        { asset: USDC, amount: "1", value: "0.95" },
        { asset: POLY, amount: "3", value: "0.6" },
        { asset: "eip155:1/erc20:0xdead", amount: "5", value: null },
      ],
      totalValue: "5001.508",
      incomplete: true,
    })) as { snapshot: boolean; totalValue: string };

    expect(result.snapshot).toBe(true);
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions[0].type).toBe("TAKE_SNAPSHOT");
    expect(actions[0].input).toMatchObject({
      id: "snap-1",
      timestamp: "2026-11-11T00:00:00.000Z",
      totalValue: "5001.508",
      perLocation: [
        { location: "ETHEREUM", value: "5000.908" },
        { location: "EIP155_137", value: "0.6" },
      ],
    });
    const perAsset = (actions[0].input as {
      perAsset: Array<{ asset: string }>;
    }).perAsset;
    expect(perAsset.map((a) => a.asset)).toEqual([ETH, USDC, POLY]);
  });

  it("stores nothing when no row is priced", async () => {
    const result = (await run({
      holdings: [{ asset: ETH, amount: "1", value: null }],
      totalValue: "0",
      incomplete: true,
    })) as { snapshot: boolean; reason: string };

    expect(result.snapshot).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses documents of another type", async () => {
    get.mockResolvedValue({
      header: { documentId: "p1", documentType: "stackfolio/price-book" },
      state: { global: {} },
    });

    await expect(
      run({ holdings: [{ asset: ETH, amount: "1", value: "2000" }] }),
    ).rejects.toThrow(/stackfolio\/portfolio/);
  });
});
