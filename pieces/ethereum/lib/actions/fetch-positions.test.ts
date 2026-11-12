import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumFetchPositionsAction } from "./fetch-positions.js";

const WALLET = "0xDead000000000000000000000000000000000001";
const MANAGER = "0xbaddc548771953b3843c9f59b19af5dc825c5b51";
const VAULT = "0x1111111111111111111111111111111111111111";
const DEBT = "0x2222222222222222222222222222222222222222";
const TOKEN0 = "0x00000000000000000000000000000000000000aa";
const TOKEN1 = "0x00000000000000000000000000000000000000bb";
const POOL = "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2";
const A_TOKEN = "0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8";
const VAR_DEBT = "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c";
const UNDERLYING = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

const word = (value: bigint | number | string): string => {
  if (typeof value === "string") {
    return value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  }
  const big = BigInt(value);
  const signed = big < 0n ? (1n << 256n) + big : big;
  return signed.toString(16).padStart(64, "0");
};

const event = {
  topic: `0x${"11".repeat(32)}`,
  name: "Mint",
  semantic: { type: "RECEIVE", subtype: "LP_MINT" },
};

const registryDoc = {
  header: { documentType: "stackfolio/protocol-registry" },
  state: {
    global: {
      protocols: [
        {
          id: "uniswap-v3",
          status: "ACTIVE",
          plugins: ["univ3-position-math"],
          chains: [
            {
              chainId: 1,
              contracts: [
                { name: "positions", address: MANAGER, kind: "POSITION" },
              ],
              events: [event],
            },
          ],
        },
        {
          id: "morpho",
          status: "ACTIVE",
          plugins: [],
          chains: [
            {
              chainId: 1,
              contracts: [
                { name: "vault", address: VAULT, kind: "POSITION" },
                { name: "debt-token", address: DEBT, kind: "DEBT", underlying: "usdc" },
              ],
              events: [event],
            },
          ],
        },
        {
          id: "aave-v3",
          status: "ACTIVE",
          plugins: ["aave-v3"],
          chains: [
            {
              chainId: 1,
              contracts: [{ name: "pool", address: POOL, kind: "CORE" }],
              events: [event],
            },
          ],
        },
        {
          id: "old-protocol",
          status: "RETIRED",
          plugins: [],
          chains: [
            {
              chainId: 1,
              contracts: [
                { name: "gone", address: `0x${"33".repeat(20)}`, kind: "POSITION" },
              ],
              events: [event],
            },
          ],
        },
      ],
    },
  },
};

/** One owned NFT (id 7, in range) and one burned (id 8, zero liquidity). */
const packedFor = (tokenId: bigint): string => {
  if (tokenId === 8n) {
    return `0x${[0, 0, TOKEN0, TOKEN1, 500, -60, 60, 0]
      .map((entry) => word(typeof entry === "string" ? entry : BigInt(entry)))
      .join("")}`;
  }
  return `0x${[0, 0, TOKEN0, TOKEN1, 500, -60, 60, "1000000000000"]
    .map((entry) =>
      word(typeof entry === "string" ? entry : BigInt(entry)),
    )
    .join("")}`;
};

const calls: string[] = [];
const rpc = vi.fn(async (_url: string, init: { body: string }) => {
  const request = JSON.parse(init.body) as {
    method: string;
    params: Array<{ to: string; data: string }>;
  };
  calls.push(`${request.params[0].to.toLowerCase()}${request.params[0].data.slice(0, 10)}`);
  const { to, data } = request.params[0];
  let result = "0x";
  if (to.toLowerCase() === MANAGER && data.startsWith("0x3850c7bd")) {
    // slot0: sqrtPrice ignored, tick = 0.
    result = `0x${word(79228162514264337593543950336n)}${word(0)}`;
  } else if (to.toLowerCase() === MANAGER && data.startsWith("0x6352211e")) {
    result = `0x${word(2)}`;
  } else if (to.toLowerCase() === MANAGER && data.startsWith("0x2f745c59")) {
    result = `0x${word(data.endsWith("1") ? 8n : 7n)}`;
  } else if (to.toLowerCase() === MANAGER && data.startsWith("0x99fbab88")) {
    const tokenId = BigInt(`0x${data.slice(10)}`);
    result = packedFor(tokenId);
  } else if (to.toLowerCase() === VAULT) {
    result = `0x${word(12345)}`;
  } else if (to.toLowerCase() === POOL && data.startsWith("0xd1946dbc")) {
    // getReservesList: an empty market keeps the shared mock neutral.
    result = `0x${word(32)}${word(0)}`;
  } else if (to.toLowerCase() === POOL && data.startsWith("0xbf92857c")) {
    result = `0x${[0, 0, 0, 0, 0].map((entry) => word(entry)).join("")}${word(1n << 255n)}`;
  } else {
    throw new Error(`unexpected eth_call target ${to}`);
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result }),
  };
});

const execute = vi.fn().mockResolvedValue({});
const get = vi.fn().mockResolvedValue(registryDoc);

const run = (props: Record<string, unknown> = {}) =>
  ethereumFetchPositionsAction.run({
    propsValue: {
      documentId: "portfolio-1",
      wallet: WALLET,
      chainId: 1,
      protocolRegistryDocumentId: "registry-1",
      fetchImpl: rpc,
      ...props,
    },
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<typeof ethereumFetchPositionsAction.run>[0]);

beforeEach(() => {
  execute.mockClear();
  get.mockClear();
  rpc.mockClear();
  calls.length = 0;
});

describe("fetch-positions", () => {
  it("collects LP and SPOT positions and replaces the wallet entry", async () => {
    const output = (await run()) as { positions: number };
    expect(output.positions).toBe(2);

    const [documentId, branch, actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(documentId).toBe("portfolio-1");
    expect(branch).toBe("main");
    expect(actions[0].type).toBe("SET_POSITIONS");
    const input = actions[0].input;
    expect(input.wallet).toBe(WALLET.toLowerCase());
    expect(input.chainId).toBe(1);
    const positions = input.positions as Array<Record<string, unknown>>;
    expect(positions).toHaveLength(2);

    const lp = positions.find((p) => p.kind === "LP");
    expect(lp?.protocol).toBe("uniswap-v3");
    expect(lp?.note).toBe("#7");
    const lpAssets = lp?.assets as Array<{ asset: string; amount: string }>;
    expect(lpAssets.map((a) => a.asset)).toEqual([
      "eip155:1/erc20:0x00000000000000000000000000000000000000aa",
      "eip155:1/erc20:0x00000000000000000000000000000000000000bb",
    ]);
    expect(BigInt(lpAssets[0].amount)).toBeGreaterThan(0n);
    expect(BigInt(lpAssets[1].amount)).toBeGreaterThan(0n);

    const spot = positions.find((p) => p.kind === "SPOT");
    expect(spot).toMatchObject({
      protocol: "morpho",
      note: "vault",
      assets: [
        { asset: "eip155:1/erc20:0x1111111111111111111111111111111111111111", amount: "12345" },
      ],
    });
  });

  it("never queries debt contracts, retired protocols or other chains", async () => {
    await run();
    const debt = calls.some((call) => call.startsWith(DEBT.toLowerCase()));
    const retired = calls.some((call) => call.startsWith(`0x${"33".repeat(20)}`));
    expect(debt).toBe(false);
    expect(retired).toBe(false);
  });

  it("rejects a wrong-typed registry document", async () => {
    get.mockResolvedValueOnce({
      header: { documentType: "stackfolio/asset-registry" },
      state: { global: {} },
    });
    await expect(run()).rejects.toThrow("not a stackfolio/protocol-registry");
  });

  it("rejects malformed wallets", async () => {
    await expect(run({ wallet: "frankp.eth" })).rejects.toThrow(
      "not an address",
    );
  });

  it("dispatches an empty list when nothing is held", async () => {
    get.mockResolvedValueOnce({
      header: { documentType: "stackfolio/protocol-registry" },
      state: { global: { protocols: [] } },
    });
    const output = (await run()) as { positions: number };
    expect(output.positions).toBe(0);
    const actions = execute.mock.calls[0][2] as Array<{
      input: Record<string, unknown>;
    }>;
    expect(actions[0].input.positions).toEqual([]);
  });

  it("sweeps the aave money market: supply positive, debt negative", async () => {
    const aaveRpc = vi.fn(async (_url: string, init: { body: string }) => {
      const request = JSON.parse(init.body) as {
        params: Array<{ to: string; data: string }>;
      };
      const { to, data } = request.params[0];
      let result = "0x";
      if (to.toLowerCase() === POOL && data.startsWith("0xd1946dbc")) {
        result = `0x${word(32)}${word(1)}${word(UNDERLYING)}`;
      } else if (to.toLowerCase() === POOL && data.startsWith("0x35ea6a75")) {
        const fields = [0, 0, 0, 0, 0, 0, 0, 0];
        result = `0x${fields.map((entry) => word(entry)).join("")}${word(A_TOKEN)}${word(0)}${word(VAR_DEBT)}`;
      } else if (to.toLowerCase() === POOL && data.startsWith("0xbf92857c")) {
        const fields = [0, 0, 0, 0, 0];
        result = `0x${fields.map((entry) => word(entry)).join("")}${word(1_230_000_000_000_000_000_000_000_000n)}`;
      } else if (to.toLowerCase() === A_TOKEN && data.startsWith("0x70a08231")) {
        result = `0x${word(5_000_000)}`;
      } else if (to.toLowerCase() === VAR_DEBT && data.startsWith("0x70a08231")) {
        result = `0x${word(2_000_000)}`;
      } else {
        throw new Error(`unexpected eth_call target ${to}`);
      }
      return { ok: true, status: 200, json: async () => ({ result }) };
    });

    const aaveOnlyDoc = {
      header: { documentType: "stackfolio/protocol-registry" },
      state: {
        global: {
          protocols: [
            {
              id: "aave-v3",
              status: "ACTIVE",
              plugins: ["aave-v3"],
              chains: [
                {
                  chainId: 1,
                  contracts: [{ name: "pool", address: POOL, kind: "CORE" }],
                  events: [event],
                },
              ],
            },
          ],
        },
      },
    };
    get.mockResolvedValueOnce(aaveOnlyDoc);
    const output = (await run({ fetchImpl: aaveRpc })) as { positions: number };
    expect(output.positions).toBe(2);
    const actions = execute.mock.calls[0][2] as Array<{
      input: { positions: Array<Record<string, unknown>> };
    }>;
    const positions = actions[0].input.positions;
    const supplied = positions.find((p) => String(p.note).startsWith("supplied"));
    const borrowed = positions.find((p) => p.note === "borrowed");
    expect(supplied).toMatchObject({
      protocol: "aave-v3",
      note: "supplied — health 1.23",
      assets: [
        {
          asset: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          amount: "5000000",
        },
      ],
    });
    expect(borrowed?.assets).toEqual([
      {
        asset: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        amount: "-2000000",
      },
    ]);
  });
});
