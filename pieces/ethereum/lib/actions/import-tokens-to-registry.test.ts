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

const run = (
  tokens: unknown,
  addedAt = "2026-11-11T10:00:00.000Z",
  protocolRegistryDocumentId?: string,
) =>
  ethereumImportTokensToRegistryAction.run({
    propsValue: {
      registryDocumentId: "r1",
      tokensJson: JSON.stringify(tokens),
      addedAt,
      ...(protocolRegistryDocumentId ? { protocolRegistryDocumentId } : {}),
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

  it("prices a known foreign native and leaves an unknown one honest", async () => {
    get.mockResolvedValue(registryDoc([]));

    await run([
      token("eip155:137/erc20:0x2222222222222222222222222222222222222222", 137),
      token("eip155:167000/erc20:0x3333333333333333333333333333333333333333", 167000),
    ]);

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ input: { identifier: string; chainId: number; symbol: string; coingeckoId: string | null } }>,
    ];
    const poly = actions.find((a) => a.input.chainId === 137)!;
    expect(poly.input.identifier).toBe("eip155:137/slip44:60");
    expect(poly.input.symbol).toBe("POL");
    expect(poly.input.coingeckoId).toBe("polygon-ecosystem-token");
    const taiko = actions.find((a) => a.input.chainId === 167000)!;
    expect(taiko.input.symbol).toBe("NATIVE");
    expect(taiko.input.coingeckoId).toBeNull();
  });
});

const ATOKEN = "eip155:1/erc20:0x98c23e9d8f16403f6149531e46307d610c671a21";
const USDC = "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const protocolDoc = {
  header: { documentId: "pr1", documentType: "stackfolio/protocol-registry" },
  state: {
    global: {
      protocols: [
        {
          id: "aave-v3",
          status: "ACTIVE",
          plugins: [],
          chains: [
            {
              chainId: 1,
              contracts: [
                {
                  name: "aUSDC",
                  address: "0x98c23e9d8f16403f6149531e46307d610c671a21",
                  kind: "DEBT",
                  underlying: USDC,
                },
              ],
              events: [],
            },
          ],
        },
      ],
    },
  },
};

describe("import-tokens-to-registry classification", () => {
  it("registers manifest contracts with their protocol kind", async () => {
    get.mockImplementation(async (id: string) =>
      id === "pr1"
        ? protocolDoc
        : {
            header: { documentId: "r1", documentType: "stackfolio/asset-registry" },
            state: { global: { assets: [] } },
          },
    );

    await run([token(ATOKEN)], "2026-11-11T10:00:00.000Z", "pr1");
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    const atoken = actions.find(
      (a) => a.input.identifier === ATOKEN,
    );
    expect(atoken).toMatchObject({
      type: "REGISTER_ASSET",
      input: { kind: "DEBT", underlying: USDC },
    });
  });

  it("corrects a plain ERC20 that the manifest says is DEBT", async () => {
    get.mockImplementation(async (id: string) =>
      id === "pr1"
        ? protocolDoc
        : {
            header: { documentId: "r1", documentType: "stackfolio/asset-registry" },
            state: {
              global: {
                assets: [
                  { identifier: ATOKEN, kind: "ERC20", underlying: null },
                ],
              },
            },
          },
    );

    const result = (await run(
      [token(ATOKEN)],
      "2026-11-11T10:00:00.000Z",
      "pr1",
    )) as { registered: number };

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    const update = actions.find((a) => a.type === "UPDATE_ASSET");
    expect(update).toMatchObject({
      input: { identifier: ATOKEN, kind: "DEBT", underlying: USDC },
    });
    expect(result.registered).toBe(2);
  });
});
