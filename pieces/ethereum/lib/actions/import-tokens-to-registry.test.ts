import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumImportTokensToRegistryAction } from "./import-tokens-to-registry.js";

const get = vi.fn();
const execute = vi.fn();

const registryDoc = (identifiers: string[]) => ({
  header: { documentId: "r1", documentType: "stackfolio/asset-registry" },
  state: {
    global: { assets: identifiers.map((identifier) => ({ identifier })) },
  },
});

const token = (identifier: string, chainId = 1) => ({
  identifier,
  symbol: "TKN",
  name: "Token",
  decimals: 18,
  kind: "ERC20",
  chainId,
});

const run = (tokens: unknown, addedAt = "2026-11-11T10:00:00.000Z") =>
  ethereumImportTokensToRegistryAction.run({
    propsValue: {
      registryDocumentId: "r1",
      tokensJson: JSON.stringify(tokens),
      addedAt,
    },
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<
    typeof ethereumImportTokensToRegistryAction.run
  >[0]);

beforeEach(() => {
  get.mockReset();
  execute.mockReset();
  execute.mockResolvedValue({});
});

describe("import-tokens-to-registry", () => {
  it("registers the native coin and unseen tokens only", async () => {
    get.mockResolvedValue(
      registryDoc(["eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"]),
    );

    const result = (await run([
      token("eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
      token("eip155:1/erc20:0x1111111111111111111111111111111111111111"),
    ])) as { registered: number };

    expect(result.registered).toBe(2);
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions.every((a) => a.type === "REGISTER_ASSET")).toBe(true);
    expect(actions.map((a) => a.input.identifier)).toEqual([
      "eip155:1/slip44:60",
      "eip155:1/erc20:0x1111111111111111111111111111111111111111",
    ]);
    expect(actions[0].input).toMatchObject({
      id: "native-1",
      symbol: "ETH",
      decimals: 18,
      kind: "NATIVE",
      coingeckoId: "ethereum",
      custom: false,
    });
  });

  it("stays silent when everything is registered", async () => {
    get.mockResolvedValue(
      registryDoc([
        "eip155:1/slip44:60",
        "eip155:1/erc20:0x1111111111111111111111111111111111111111",
      ]),
    );

    const result = (await run([
      token("eip155:1/erc20:0x1111111111111111111111111111111111111111"),
    ])) as { registered: number };

    expect(result.registered).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("mints a native asset for foreign chains too", async () => {
    get.mockResolvedValue(registryDoc([]));

    await run([token("eip155:137/erc20:0x2222222222222222222222222222222222222222", 137)]);

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ input: { identifier: string; chainId: number; coingeckoId: string | null } }>,
    ];
    expect(actions[0].input.identifier).toBe("eip155:137/slip44:60");
    expect(actions[0].input.chainId).toBe(137);
    expect(actions[0].input.coingeckoId).toBeNull();
  });
});
