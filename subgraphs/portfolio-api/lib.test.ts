import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionResult } from "viem";
import { forwardEnsAddress } from "./lib.js";

const RESOLVER = "0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41";
const ADDRESS = "5c647ca5e2bc5bd17c40410fcb8003d38879ae50";

const addrAbiResult = [
  {
    inputs: [
      { internalType: "bytes32", name: "node", type: "bytes32" },
      { internalType: "uint256", name: "coinType", type: "uint256" },
    ],
    name: "addr",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const registryAbiResult = [
  {
    inputs: [{ internalType: "bytes32", name: "node", type: "bytes32" }],
    name: "resolver",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** Serve a scripted eth_call chain; records every call it answers. */
function stubNode(replies: (string | null)[]) {
  const seen: { to: string; data: string }[] = [];
  let next = 0;
  vi.stubGlobal(
    "fetch",
    async (_url: unknown, init: { body: string }) => {
      const request = JSON.parse(String(init.body)) as {
        id: number;
        params: [{ to: string; data: string }];
      };
      seen.push(request.params[0]);
      const reply = replies[next++];
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          ...(reply === null
            ? { error: { code: 3, message: "execution reverted" } }
            : { result: reply }),
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  );
  return seen;
}

const addrReply = (bytes: string) =>
  encodeFunctionResult({
    abi: addrAbiResult,
    functionName: "addr",
    result: bytes as `0x${string}`,
  });

describe("forwardEnsAddress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the address a plain resolver returns", async () => {
    const seen = stubNode([
      encodeFunctionResult({
        abi: registryAbiResult,
        functionName: "resolver",
        result: RESOLVER,
      }),
      addrReply(`0x${ADDRESS}`),
    ]);
    const address = await forwardEnsAddress("http://127.0.0.1:8545", "frankp.eth");
    expect(address).toBe(`0x${ADDRESS}`);
    // Registry first, then the resolver it named - no universal resolver.
    expect(seen[0].to).toBe("0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e");
    // viem writes the checksummed form back into the call.
    expect(seen[1].to.toLowerCase()).toBe(RESOLVER);
  });

  it("takes the last 20 bytes of a 32-byte word", async () => {
    stubNode([
      encodeFunctionResult({
        abi: registryAbiResult,
        functionName: "resolver",
        result: RESOLVER,
      }),
      addrReply(`0x000000000000000000000000${ADDRESS}`),
    ]);
    expect(await forwardEnsAddress("http://127.0.0.1:8545", "frankp.eth")).toBe(
      `0x${ADDRESS}`,
    );
  });

  it("answers null when the name has no resolver", async () => {
    stubNode([
      encodeFunctionResult({
        abi: registryAbiResult,
        functionName: "resolver",
        result: "0x0000000000000000000000000000000000000000",
      }),
    ]);
    expect(await forwardEnsAddress("http://127.0.0.1:8545", "gone.eth")).toBeNull();
  });

  it("refuses a non-http rpc url before touching the network", async () => {
    stubNode([]);
    await expect(
      forwardEnsAddress("file:///etc/passwd", "evil.eth"),
    ).rejects.toThrow("http(s)");
  });
});
