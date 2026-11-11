import { beforeEach, describe, expect, it, vi } from "vitest";
import { namehash } from "viem";

import {
  ENS_REGISTRY,
  parseAddressFromResult,
  parseBytesString,
  selectorForAddr,
  selectorForName,
  selectorForResolver,
} from "../ens.js";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const REVERSE_RESOLVER = "0x4444444444444444444444444444444444444444";
const FORWARD_RESOLVER = "0x5555555555555555555555555555555555555555";
const NAME = "frankp.eth";

const ethCall = vi.fn();

vi.mock("../client.js", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, createClientBundle: () => ({ ethCall }) };
});

import { ethereumFetchEnsNamesAction } from "./fetch-ens-names.js";

const word = (hex: string) => hex.padStart(64, "0");
const addressWord = (address: string) => word(address.slice(2).toLowerCase());
const bytesResult = (text: string) => {
  const payload = Buffer.from(text, "utf8").toString("hex");
  return (
    "0x" +
    word("20") +
    word((payload.length / 2).toString(16)) +
    payload.padEnd(Math.ceil(payload.length / 64) * 64, "0")
  );
};

describe("ens parse helpers", () => {
  it("reads an address from an ABI word", () => {
    expect(parseAddressFromResult(`0x${addressWord(ACCOUNT)}`)).toBe(ACCOUNT);
  });

  it("reads an ABI-encoded bytes string", () => {
    expect(parseBytesString(bytesResult(NAME))).toBe(NAME);
    expect(parseBytesString(bytesResult(""))).toBe("");
  });

  it("rejects results too short to hold an address", () => {
    expect(() => parseAddressFromResult("0x1234")).toThrow();
  });
});

describe("fetch-ens-names", () => {
  const runAction = async (addresses: string[]) =>
    (await ethereumFetchEnsNamesAction.run({
      propsValue: { addressesJson: JSON.stringify(addresses) },
      auth: { props: {} },
    } as unknown as Parameters<typeof ethereumFetchEnsNamesAction.run>[0])) as {
      labels: Record<string, string>;
    };

  beforeEach(() => {
    ethCall.mockReset();
  });

  it("resolves a name through reverse, name and forward hops", async () => {
    const reverseNode = namehash(
      `${ACCOUNT.slice(2)}.addr.reverse`,
    );
    const nameNode = namehash(NAME);
    ethCall.mockImplementation((to: string, data: string) => {
        if (to === ENS_REGISTRY && data.startsWith(selectorForResolver(reverseNode))) {
          return `0x${addressWord(REVERSE_RESOLVER)}`;
        }
        if (to === REVERSE_RESOLVER && data.startsWith(selectorForName())) {
          return bytesResult(NAME);
        }
        if (to === ENS_REGISTRY && data.startsWith(selectorForResolver(nameNode))) {
          return `0x${addressWord(FORWARD_RESOLVER)}`;
        }
        if (to === FORWARD_RESOLVER && data.startsWith(selectorForAddr(nameNode))) {
          return `0x${addressWord(ACCOUNT)}`;
        }
      throw new Error(`unexpected call ${to} ${data.slice(0, 10)}`);
    });

    const result = await runAction([ACCOUNT]);

    expect(result.labels[ACCOUNT]).toBe(NAME);
  });

  it("skips addresses without resolvers and survives reverts", async () => {
    const other = "0x6666666666666666666666666666666666666666";
    ethCall.mockImplementation((to: string, data: string) => {
      if (to === ENS_REGISTRY && data.startsWith(selectorForResolver(namehash(`${ACCOUNT.slice(2)}.addr.reverse`)))) {
        return `0x${addressWord(REVERSE_RESOLVER)}`;
      }
      if (to === ENS_REGISTRY && data.startsWith(selectorForResolver(namehash(`${other.slice(2)}.addr.reverse`)))) {
        return `0x${word("0")}`; // no reverse resolver
      }
      if (to === REVERSE_RESOLVER && data.startsWith(selectorForName())) {
        throw new Error("resolver reverted");
      }
      throw new Error(`unexpected call ${to}`);
    });

    const result = await runAction([ACCOUNT, other]);

    // The reverting resolver yields no label; the zero resolver likewise.
    expect(result.labels).toEqual({});
  });

  it("rejects names whose forward resolution points elsewhere", async () => {
    ethCall.mockImplementation((to: string, data: string) => {
      if (to === ENS_REGISTRY && data.startsWith(selectorForResolver(namehash(`${ACCOUNT.slice(2)}.addr.reverse`)))) {
        return `0x${addressWord(REVERSE_RESOLVER)}`;
      }
      if (to === REVERSE_RESOLVER && data.startsWith(selectorForName())) {
        return bytesResult(NAME);
      }
      if (to === ENS_REGISTRY && data.startsWith(selectorForResolver(namehash(NAME)))) {
        return `0x${addressWord(FORWARD_RESOLVER)}`;
      }
      if (to === FORWARD_RESOLVER && data.startsWith(selectorForAddr(namehash(NAME)))) {
        return `0x${addressWord("0x9999999999999999999999999999999999999999")}`;
      }
      throw new Error(`unexpected call ${to}`);
    });

    const result = await runAction([ACCOUNT]);

    expect(result.labels).toEqual({});
  });

  it("reports a malformed addresses list", async () => {
    await expect(
      ethereumFetchEnsNamesAction.run({
        propsValue: { addressesJson: "not json" },
        auth: { props: {} },
      } as unknown as Parameters<typeof ethereumFetchEnsNamesAction.run>[0]),
    ).rejects.toThrow(/addressesJson/);
  });
});
