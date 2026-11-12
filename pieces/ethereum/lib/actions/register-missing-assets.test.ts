import { beforeEach, describe, expect, it, vi } from "vitest";

const ethCall = vi.fn();

vi.mock("../client.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, createClientBundle: () => ({ ethCall }) };
});

import { ethereumRegisterMissingAssetsAction } from "./register-missing-assets.js";

const get = vi.fn();
const execute = vi.fn();

const DAI = "0x6b175474e89094c44da98b954eedeac495271fcf";

const registryDoc = (identifiers: string[]) => ({
  header: { documentId: "r1", documentType: "stackfolio/asset-registry" },
  state: {
    global: { assets: identifiers.map((identifier) => ({ identifier })) },
  },
});

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

const run = (holdingsJson: unknown, protocolRegistryDocumentId?: string) =>
  ethereumRegisterMissingAssetsAction.run({
    propsValue: {
      assetRegistryDocumentId: "r1",
      holdingsJson,
      addedAt: "2026-11-12T10:00:00.000Z",
      ...(protocolRegistryDocumentId ? { protocolRegistryDocumentId } : {}),
    },
    auth: { props: {} },
    reactor: { get, execute },
  } as unknown as Parameters<
    typeof ethereumRegisterMissingAssetsAction.run
  >[0]);

beforeEach(() => {
  ethCall.mockReset();
  get.mockReset();
  execute.mockReset();
  execute.mockResolvedValue({});
});

describe("register-missing-assets", () => {
  it("registers an unseen native and an unseen ERC-20 with contract metadata", async () => {
    get.mockResolvedValue(
      registryDoc(["bip122:000000000019d6689c085ae165831e93/slip44:0"]),
    );
    ethCall.mockImplementation((to: string, data: string) => {
      if (to === DAI && data.startsWith("0x95d89b41"))
        return Promise.resolve(abiString("DAI"));
      if (to === DAI && data.startsWith("0x06fdde03"))
        return Promise.resolve(abiString("Dai Stablecoin"));
      if (to === DAI && data.startsWith("0x313ce567"))
        return Promise.resolve(`0x${word("12")}`);
      return Promise.reject(new Error("revert"));
    });

    const result = (await run({
      holdings: [
        { asset: "eip155:1/slip44:60" },
        { asset: `eip155:1/erc20:${DAI}` },
        { asset: "bip122:000000000019d6689c085ae165831e93/slip44:0" },
      ],
    })) as { registered: number };

    expect(result.registered).toBe(2);
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions.map((a) => a.input.identifier)).toEqual([
      "eip155:1/slip44:60",
      `eip155:1/erc20:${DAI}`,
    ]);
    expect(actions[0].input).toMatchObject({
      symbol: "ETH",
      name: "Ether",
      decimals: 18,
      kind: "NATIVE",
      coingeckoId: "ethereum",
    });
    expect(actions[1].input).toMatchObject({
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      kind: "ERC20",
      underlying: null,
    });
  });

  it("degrades a broken token to the address fallback", async () => {
    get.mockResolvedValue(registryDoc([]));
    ethCall.mockRejectedValue(new Error("revert"));

    const result = (await run([
      `eip155:1/erc20:${DAI}`,
    ])) as { registered: number };

    expect(result.registered).toBe(1);
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ input: Record<string, unknown> }>,
    ];
    expect(actions[0].input).toMatchObject({
      symbol: `TKN-${DAI.slice(2, 8)}`,
      decimals: 18,
      kind: "ERC20",
    });
  });

  it("dispatches nothing when the registry already holds every asset", async () => {
    get.mockResolvedValue(
      registryDoc(["eip155:1/slip44:60", `eip155:1/erc20:${DAI}`]),
    );

    const result = (await run({
      holdings: [
        { asset: "eip155:1/slip44:60" },
        { asset: `eip155:1/erc20:${DAI}` },
      ],
    })) as { registered: number };

    expect(result.registered).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("classifies a manifest contract as its protocol kind", async () => {
    get.mockImplementation((id: string) =>
      id === "r1"
        ? Promise.resolve(registryDoc([]))
        : Promise.resolve({
            header: { documentId: "p1", documentType: "stackfolio/protocol-registry" },
            state: {
              global: {
                protocols: [
                  {
                    id: "aave-v3",
                    status: "ACTIVE",
                    chains: [
                      {
                        chainId: 1,
                        contracts: [
                          {
                            name: "aave-v3-debt-dai",
                            address: DAI,
                            kind: "DEBT",
                            underlying: "eip155:1/slip44:60",
                          },
                        ],
                        events: [],
                      },
                    ],
                  },
                ],
              },
            },
          }),
    );
    ethCall.mockRejectedValue(new Error("revert"));

    const result = (await run(
      [{ asset: `eip155:1/erc20:${DAI}` }],
      "p1",
    )) as { registered: number };

    expect(result.registered).toBe(1);
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ input: Record<string, unknown> }>,
    ];
    expect(actions[0].input).toMatchObject({
      kind: "DEBT",
      underlying: "eip155:1/slip44:60",
    });
  });

  it("refuses a document that is not the asset registry", async () => {
    get.mockResolvedValue({
      header: { documentId: "r1", documentType: "stackfolio/portfolio" },
      state: { global: {} },
    });
    await expect(run(["eip155:1/slip44:60"])).rejects.toThrow(
      /not stackfolio\/asset-registry/,
    );
  });
});
