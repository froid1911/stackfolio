import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumSnapshotPortfolioAction } from "./snapshot-portfolio.js";

const get = vi.fn();
const execute = vi.fn();

const ETH = "eip155:1/slip44:60";
const USDC = "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const POLY = "eip155:137/erc20:0x0000000000000000000000000000000000001010";

const run = (holdings: unknown, registryJson?: unknown) =>
  ethereumSnapshotPortfolioAction.run({
    propsValue: {
      portfolioDocumentId: "p1",
      holdingsJson: JSON.stringify(holdings),
      snapshotId: "snap-1",
      timestamp: "2026-11-11T00:00:00.000Z",
      ...(registryJson === undefined ? {} : { registryJson }),
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

const AUSDC = "eip155:1/erc20:0x98c23e9d8f16403f6149531e46307d610c671a21";
const registryWithDebt = {
  assets: [
    { identifier: ETH, kind: "NATIVE", decimals: 18 },
    { identifier: USDC, kind: "ERC20", decimals: 6 },
    { identifier: AUSDC, kind: "DEBT", underlying: USDC, decimals: 18 },
  ],
};

describe("snapshot-portfolio liabilities", () => {
  const holdingsWithDebt = {
    holdings: [
      { asset: ETH, amount: "2.499979", value: "4999.958" },
      { asset: USDC, amount: "100", value: "100" },
      { asset: AUSDC, amount: "40", value: null },
    ],
    totalValue: "5099.958",
    incomplete: false,
  };

  it("books DEBT rows as liabilities and nets the worth", async () => {
    const result = (await run(holdingsWithDebt, registryWithDebt)) as {
      snapshot: boolean;
      totalValue: string;
      netWorth: string;
    };

    expect(result.snapshot).toBe(true);
    expect(result.totalValue).toBe("5099.958");
    expect(result.netWorth).toBe("5059.958");
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ input: Record<string, unknown> }>,
    ];
    expect(actions[0].input.liabilities).toEqual([
      { asset: AUSDC, amount: "40" },
    ]);
    expect(actions[0].input.netWorth).toBe("5059.958");
    const perAsset = actions[0].input.perAsset as Array<{ asset: string }>;
    expect(perAsset.map((a) => a.asset)).toEqual([ETH, USDC]);
  });

  it("leaves net worth unknown without a registry", async () => {
    const result = (await run(holdingsWithDebt)) as {
      netWorth: string | null;
    };

    expect(result.netWorth).toBeNull();
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ input: Record<string, unknown> }>,
    ];
    expect(actions[0].input.netWorth).toBeNull();
    expect(actions[0].input.liabilities).toEqual([]);
  });

  it("leaves net worth unknown when the underlying is not held", async () => {
    const result = (await run(
      {
        holdings: [
          { asset: ETH, amount: "1", value: "2000" },
          { asset: AUSDC, amount: "40", value: null },
        ],
        totalValue: "2000",
      },
      registryWithDebt,
    )) as { netWorth: string | null };

    expect(result.netWorth).toBeNull();
  });

  it("nets to a negative worth when debt exceeds assets", async () => {
    const result = (await run(
      {
        holdings: [
          { asset: USDC, amount: "10", value: "10" },
          { asset: AUSDC, amount: "40", value: null },
        ],
        totalValue: "10",
      },
      registryWithDebt,
    )) as { netWorth: string | null };

    expect(result.netWorth).toBe("-30");
  });
});
