import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ethereumFetchTokenBalancesAction,
  ledgerTokens,
  readTokenBalances,
  sameReading,
} from "./fetch-token-balances.js";

const WALLET = "0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50";
const USDT = "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7";
const WBTC = "eip155:1/erc20:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const DEAD = "eip155:1/erc20:0x1111111111111111111111111111111111111111";

const get = vi.fn();
const execute = vi.fn().mockResolvedValue({});

/** A Multicall3 stand-in: per-contract answers, failures for the rest. */
function reader(answers: Record<string, bigint>, block = 21_000_000n) {
  const multicall = vi.fn(async (args: { contracts: { address: string }[]; blockNumber: bigint }) =>
    args.contracts.map((c) =>
      c.address.toLowerCase() in answers
        ? { status: "success" as const, result: answers[c.address.toLowerCase()] }
        : { status: "failure" as const, error: new Error("execution reverted") },
    ),
  );
  return { getBlockNumber: vi.fn(async () => block), multicall };
}

const wallet = (over: Record<string, unknown> = {}) => ({
  header: { documentType: "stackfolio/wallet-account" },
  state: {
    global: {
      address: WALLET,
      chainId: 1,
      ignored: false,
      ledger: [{ asset: USDT }, { asset: WBTC }, { asset: USDT }, { asset: DEAD }, { asset: "eip155:1/slip44:60" }],
      tokenBalances: null,
      ...over,
    },
  },
});

const run = (props: Record<string, unknown>) =>
  ethereumFetchTokenBalancesAction.run({
    propsValue: { accountDocumentId: "w1", now: "2026-11-14T13:00:00.000Z", ...props },
    auth: { props: {} },
    reactor: { get, execute },
  } as unknown as Parameters<typeof ethereumFetchTokenBalancesAction.run>[0]);

beforeEach(() => {
  get.mockReset();
  execute.mockClear();
});

describe("ledgerTokens", () => {
  it("lists the chain's ERC-20 contracts once each, nothing else", () => {
    expect(
      ledgerTokens({
        chainId: 1,
        ledger: [{ asset: USDT }, { asset: USDT }, { asset: "eip155:137/erc20:0x" + "a".repeat(40) }, { asset: "eip155:1/erc20:0xbad" }],
      }),
    ).toEqual([{ asset: USDT, contract: "0xdac17f958d2ee523a2206206994597c13d831ec7" }]);
    expect(ledgerTokens({})).toEqual([]);
  });
});

describe("sameReading", () => {
  it("compares readings by token and amount, in any order", () => {
    const a = [{ asset: "x", amount: "1" }, { asset: "y", amount: "0" }];
    expect(sameReading([...a].reverse(), a)).toBe(true);
    expect(sameReading(a, [{ asset: "x", amount: "1" }, { asset: "y", amount: "2" }])).toBe(false);
    expect(sameReading(a, a.slice(0, 1))).toBe(false);
    expect(sameReading(undefined, a)).toBe(false);
  });
});

describe("readTokenBalances", () => {
  it("reads every token at one block, in chunks, leaving failed calls out", async () => {
    const tokens = Array.from({ length: 301 }, (_, i) => ({
      asset: `t${i}`,
      contract: `0x${i.toString(16).padStart(40, "0")}`,
    }));
    const r = reader({ [tokens[0].contract]: 5n, [tokens[300].contract]: 0n });
    const result = await readTokenBalances(r, WALLET, tokens);
    expect(r.multicall).toHaveBeenCalledTimes(2);
    expect(r.multicall.mock.calls.every(([args]) => args.blockNumber === 21_000_000n)).toBe(true);
    expect(result).toEqual({
      blockNumber: 21_000_000,
      balances: [
        { asset: "t0", amount: "5" },
        { asset: "t300", amount: "0" },
      ],
      failed: 299,
    });
  });
});

describe("fetch-token-balances", () => {
  it("records the reading, zeros included", async () => {
    get.mockResolvedValue(wallet());
    const r = reader({ "0xdac17f958d2ee523a2206206994597c13d831ec7": 0n, "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": 184600n });
    const result = await run({ reader: r });

    expect(result).toEqual({ tokens: 3, changed: true, blockNumber: 21_000_000, held: 1, failed: 1 });
    const [, , actions] = execute.mock.calls[0] as [string, string, { type: string; input: unknown }[]];
    expect(actions[0]).toMatchObject({
      type: "SET_TOKEN_BALANCES",
      input: {
        blockNumber: 21_000_000,
        observedAt: "2026-11-14T13:00:00.000Z",
        balances: [
          { asset: WBTC, amount: "184600" },
          { asset: USDT, amount: "0" },
        ],
      },
    });
  });

  it("writes nothing when the balances did not change", async () => {
    get.mockResolvedValue(
      wallet({ tokenBalances: { blockNumber: 20_999_000, balances: [{ asset: USDT, amount: "0" }] } }),
    );
    const result = await run({ reader: reader({ "0xdac17f958d2ee523a2206206994597c13d831ec7": 0n }) });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ changed: false });
  });

  it("never records a reading from behind the stored block", async () => {
    get.mockResolvedValue(wallet({ tokenBalances: { blockNumber: 21_000_001, balances: [] } }));
    const result = await run({ reader: reader({ "0xdac17f958d2ee523a2206206994597c13d831ec7": 1n }) });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ behind: true });
  });

  it("reports an RPC that does not answer, and keeps the last reading", async () => {
    get.mockResolvedValue(wallet());
    const r = reader({});
    r.getBlockNumber.mockRejectedValue(new Error("fetch failed"));
    const result = await run({ reader: r });
    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ changed: false, error: "fetch failed" });
  });

  it("skips ignored wallets, chains without an RPC and empty ledgers", async () => {
    get.mockResolvedValue(wallet({ ignored: true }));
    expect(await run({ reader: reader({}) })).toMatchObject({ skipped: "ignored or no address" });
    get.mockResolvedValue(wallet({ chainId: 999 }));
    expect(await run({ reader: reader({}) })).toMatchObject({ skipped: "no RPC for chain 999" });
    get.mockResolvedValue(wallet({ ledger: [] }));
    expect(await run({ reader: reader({}) })).toEqual({ tokens: 0, changed: false });
  });

  it("refuses a document that is not a wallet", async () => {
    get.mockResolvedValue({ header: { documentType: "stackfolio/portfolio" }, state: {} });
    await expect(run({})).rejects.toThrow("not a stackfolio/wallet-account");
  });
});
