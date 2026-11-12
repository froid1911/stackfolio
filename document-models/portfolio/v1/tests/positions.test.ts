import {
  reducer,
  setPositions,
  utils,
  type PositionInput,
} from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const entry = (
  protocol: string,
  amount: string,
  overrides: Record<string, unknown> = {},
) => ({
  protocol,
  kind: "SPOT" as const,
  assets: [{ asset: "eip155:1/erc20:0xusdc", amount }],
  ...overrides,
});

const set = (
  wallet: string,
  chainId: number,
  positions: PositionInput[],
  fetchedAt = "2026-11-12T00:00:00.000Z",
) => setPositions({ wallet, chainId, fetchedAt, positions });

describe("PositionsOperations", () => {
  it("records a wallet's positions on a chain", () => {
    const document = reducer(
      utils.createDocument(),
      set("0xaa", 1, [entry("aave-v3", "1500")]),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.positions).toEqual([
      {
        wallet: "0xaa",
        chainId: 1,
        fetchedAt: "2026-11-12T00:00:00.000Z",
        positions: [
          {
            protocol: "aave-v3",
            kind: "SPOT",
            assets: [{ asset: "eip155:1/erc20:0xusdc", amount: "1500" }],
            note: null,
          },
        ],
      },
    ]);
  });

  it("replaces the whole entry for the same wallet and chain", () => {
    let document = reducer(
      utils.createDocument(),
      set("0xaa", 1, [entry("aave-v3", "1500")]),
    );
    document = reducer(
      document,
      set(
        "0xaa",
        1,
        [entry("uniswap-v3", "40", { kind: "LP" })],
        "2026-11-13T00:00:00.000Z",
      ),
    );

    expect(document.state.global.positions).toHaveLength(1);
    expect(document.state.global.positions[0].fetchedAt).toBe(
      "2026-11-13T00:00:00.000Z",
    );
    expect(document.state.global.positions[0].positions[0].protocol).toBe(
      "uniswap-v3",
    );
  });

  it("keeps chains apart", () => {
    let document = reducer(
      utils.createDocument(),
      set("0xaa", 1, [entry("aave-v3", "1500")]),
    );
    document = reducer(document, set("0xaa", 8453, [entry("aave-v3", "90")]));
    document = reducer(document, set("0xbb", 1, [entry("spark", "7")]));

    expect(document.state.global.positions).toHaveLength(3);
  });

  it("clears a wallet's positions with an empty list", () => {
    let document = reducer(
      utils.createDocument(),
      set("0xaa", 1, [entry("aave-v3", "1500")]),
    );
    document = reducer(document, set("0xaa", 1, []));

    expect(document.state.global.positions[0].positions).toEqual([]);
  });
});
