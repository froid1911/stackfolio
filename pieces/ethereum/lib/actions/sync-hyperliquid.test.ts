import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumSyncHyperliquidAction } from "./sync-hyperliquid.js";

const get = vi.fn();
const execute = vi.fn();

const ADDRESS = "0x8a88728340b81741c8ad70b07f601d99e9c3f7cb";
const OTHER = "0x0000000000000000000000000000000000000002";

const hlDoc = (addresses: string[]) => ({
  header: {
    documentId: "h1",
    documentType: "stackfolio/hyperliquid-account",
  },
  state: {
    global: {
      accounts: addresses.map((address) => ({ address })),
    },
  },
});

const run = async (
  props: Record<string, unknown> = {},
): Promise<{
  ok: string[];
  errors: Array<{ address: string | null; message: string }>;
}> =>
  (await ethereumSyncHyperliquidAction.run({
    propsValue: {
      hyperliquidDocumentId: "h1",
      ranAt: "2026-11-11T10:00:00.000Z",
      ...props,
    },
    auth: {},
    reactor: { get, execute },
  } as unknown as Parameters<
    typeof ethereumSyncHyperliquidAction.run
  >[0])) as {
    ok: string[];
    errors: Array<{ address: string | null; message: string }>;
  };

/** Answer HL `/info` requests by type; routes[address] overrides the
 * account-scoped answers so the second wallet can differ. */
function stubHl(
  routes: Record<string, unknown>,
  opts: { failUser?: string } = {},
) {
  const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (opts.failUser && body.user === opts.failUser) {
      return { status: 422, json: async () => ({ message: "nope" }) };
    }
    const answer: Record<string, unknown> = {
      spotMeta: { universe: [{ name: "USDC", tokenId: 0 }] },
      spotClearinghouseState: {
        balances: [{ token: "0", total: "10", hold: "0", entryNtl: "10" }],
      },
      clearinghouseState: {
        marginSummary: { accountValue: "10" },
        assetPositions: [],
      },
      userFills: [],
      ...routes,
    };
    return { status: 200, json: async () => answer[String(body.type)] };
  });
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

beforeEach(() => {
  get.mockReset();
  execute.mockReset();
  execute.mockResolvedValue({});
  vi.unstubAllGlobals();
});

describe("sync-hyperliquid", () => {
  it("refuses a document of another type", async () => {
    get.mockResolvedValue({
      header: { documentId: "h1", documentType: "stackfolio/portfolio" },
      state: {},
    });
    await expect(run()).rejects.toThrow(/not stackfolio\/hyperliquid-account/);
  });

  it("demands a parseable ranAt", async () => {
    await expect(run({ ranAt: "yesterday" })).rejects.toThrow(/ranAt/);
  });

  it("reports an empty account list without touching the drive", async () => {
    stubHl({});
    get.mockResolvedValue(hlDoc([]));
    const result = await run();
    expect(result.ok).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/no accounts/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("records one snapshot per tracked account", async () => {
    stubHl({});
    get.mockResolvedValue(hlDoc([ADDRESS.toUpperCase()]));

    const result = await run();
    expect(result.ok).toEqual([ADDRESS]);
    expect(result.errors).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
    const [documentId, branch, actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(documentId).toBe("h1");
    expect(branch).toBe("main");
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("RECORD_SNAPSHOT");
    expect(actions[0]?.input).toMatchObject({
      address: ADDRESS.toUpperCase(),
      accountValueUsd: "10",
      spot: [{ tokenIndex: 0, coin: "USDC", total: "10", hold: "0" }],
      perps: [],
      updatedAt: "2026-11-11T10:00:00.000Z",
    });
  });

  it("skips malformed addresses and refuses accounts the API rejects", async () => {
    stubHl({}, { failUser: OTHER });
    get.mockResolvedValue(hlDoc(["frankp.eth", ADDRESS, OTHER]));

    const result = await run();
    expect(result.ok).toEqual([ADDRESS]);
    const malformed = result.errors.find((error) => error.address === "frankp.eth");
    expect(malformed?.message).toMatch(/40-hex/);
    const rejected = result.errors.find((error) => error.address === OTHER);
    expect(rejected?.message).toMatch(/nope/);
    // Only the healthy account is dispatched.
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ input: { address: string } }>,
    ];
    expect(actions.map((action) => action.input.address)).toEqual([ADDRESS]);
  });

  it("reports an unreachable account and dispatches nothing", async () => {
    // Every call answers 422 (rejected): no retry waits, so the action
    // finishes at once with the error surfaced and no dispatch.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 422,
        json: async () => ({ message: "Unrecognized input type" }),
      })),
    );
    get.mockResolvedValue(hlDoc([ADDRESS]));
    const result = await run();
    expect(result.ok).toEqual([]);
    expect(result.errors[0]?.message).toMatch(/Unrecognized input type/);
    expect(execute).not.toHaveBeenCalled();
  });
});
