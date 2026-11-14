import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumIgnoreUnlistedTokensAction, unlistedCandidates } from "./ignore-unlisted-tokens.js";

const token = (hex: string) => `eip155:1/erc20:0x${hex.repeat(40).slice(0, 40)}`;
const WBTC = "eip155:1/erc20:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
const LP = token("c"); // a Curve LP: DefiLlama prices it, CoinGecko does not
const SPAM = token("d");
const IGNORED = token("e");
const OVERRIDDEN = token("f");

const doc = (global: unknown) => ({ header: { documentType: "x" }, state: { global } });
const registry = doc({
  assets: [WBTC, LP, SPAM, IGNORED, OVERRIDDEN, "eip155:1/slip44:60", "eip155:1/erc20:0xbad"].map((identifier) => ({
    identifier,
  })),
});
const portfolio = doc({ ignoredAssets: [IGNORED], priceOverrides: [{ asset: OVERRIDDEN }] });
const book = doc({ latest: [{ asset: WBTC }] });

const get = vi.fn((id: string) => Promise.resolve(({ p: portfolio, r: registry, b: book } as Record<string, unknown>)[id]));
const execute = vi.fn().mockResolvedValue({});

const llama = (known: string[], status = 200) =>
  vi.fn(async (url: string) => {
    const coins = Object.fromEntries(
      url
        .split("/current/")[1]
        .split(",")
        .filter((key) => known.includes(key))
        .map((key) => [key, { price: 1 }]),
    );
    return { ok: status < 400, status, json: async () => ({ coins }) } as Response;
  });

const run = (fetchImpl: unknown) =>
  ethereumIgnoreUnlistedTokensAction.run({
    propsValue: { portfolioDocumentId: "p", registryDocumentId: "r", priceBookDocumentId: "b", fetchImpl },
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<typeof ethereumIgnoreUnlistedTokensAction.run>[0]);

beforeEach(() => execute.mockClear());

describe("unlistedCandidates", () => {
  it("names registered tokens nothing prices, ignores or overrides yet", () => {
    expect(
      unlistedCandidates(
        registry.state.global as never,
        portfolio.state.global as never,
        book.state.global as never,
      ),
    ).toEqual([LP, SPAM].sort());
    expect(unlistedCandidates({}, {}, {})).toEqual([]);
  });
});

describe("ignore-unlisted-tokens", () => {
  it("ignores the tokens DefiLlama does not know either", async () => {
    const result = await run(llama([`ethereum:${LP.split(":").pop()}`]));
    expect(result).toEqual({ checked: 2, ignored: 1, unanswered: 0 });
    const [id, , actions] = execute.mock.calls[0] as [string, string, { type: string; input: unknown }[]];
    expect(id).toBe("p");
    expect(actions).toEqual([{ type: "SET_ASSET_IGNORED", input: { asset: SPAM, ignored: true }, scope: "global" }].map((a) => expect.objectContaining({ type: a.type, input: a.input })));
  });

  it("ignores nothing when DefiLlama does not answer", async () => {
    const result = await run(llama([], 503));
    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 2, ignored: 0, unanswered: 2 });
  });
});
