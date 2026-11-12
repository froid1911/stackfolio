import { beforeEach, describe, expect, it, vi } from "vitest";

const ethCall = vi.fn();

vi.mock("../client.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, createClientBundle: () => ({ ethCall }) };
});

import { ethereumFetchTokenMetadataAction } from "./fetch-token-metadata.js";

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const BROKEN = "0x0000000000000000000000000000000000dead10";
const NO_NAME = "0x1111111111111111111111111111111111111111";

const SYMBOL = "0x95d89b41";
const NAME = "0x06fdde03";
const DECIMALS = "0x313ce567";

const word = (hex: string) => hex.padStart(64, "0");
const abiString = (text: string) => {
  const payload = Buffer.from(text, "utf8").toString("hex");
  return (
    "0x" +
    word("20") +
    word((payload.length / 2).toString(16)) +
    payload.padEnd(Math.ceil(payload.length / 64) * 64, "0")
  );
};

const runAction = async (tokens: string[], chainId = 1) =>
  (await ethereumFetchTokenMetadataAction.run({
    propsValue: { tokensJson: JSON.stringify(tokens), chainId },
    auth: { props: {} },
  } as unknown as Parameters<
    typeof ethereumFetchTokenMetadataAction.run
  >[0])) as {
    tokens: Array<{
      identifier: string;
      symbol: string;
      name: string;
      decimals: number;
      kind: string;
      chainId: number;
    }>;
  };

beforeEach(() => {
  ethCall.mockReset();
});

describe("fetch-token-metadata", () => {
  it("reads clean metadata and degrades every failure to a fallback", async () => {
    ethCall.mockImplementation((to: string, data: string) => {
      if (to === USDC) {
        if (data.startsWith(SYMBOL)) return abiString("USDC");
        if (data.startsWith(NAME)) return abiString("USD Coin");
        if (data.startsWith(DECIMALS)) return `0x${"6".padStart(64, "0")}`;
      }
      if (to === NO_NAME && data.startsWith(SYMBOL)) {
        return abiString("WEIRD");
      }
      // Everything else reverts (empty return data).
      return "0x";
    });

    const result = await runAction([USDC, NO_NAME, BROKEN]);

    const usdc = result.tokens[0];
    expect(usdc).toEqual({
      identifier: `eip155:1/erc20:${USDC}`,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      kind: "ERC20",
      chainId: 1,
    });

    const weird = result.tokens[1];
    expect(weird.symbol).toBe("WEIRD");
    // A reverted name() falls back to the symbol, not to the TKN label.
    expect(weird.name).toBe("WEIRD");
    expect(weird.decimals).toBe(18);

    const broken = result.tokens[2];
    expect(broken.symbol).toBe("TKN-000000");
    expect(broken.decimals).toBe(18);
  });

  it("rejects a malformed tokens list", async () => {
    await expect(
      ethereumFetchTokenMetadataAction.run({
        propsValue: { tokensJson: "{oops", chainId: 1 },
        auth: { props: {} },
      } as unknown as Parameters<
        typeof ethereumFetchTokenMetadataAction.run
      >[0]),
    ).rejects.toThrow(/tokensJson/);
  });
});
