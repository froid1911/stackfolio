import { describe, expect, it } from "vitest";
import { providerForChain, unsupportedChainMessage } from "./providers.js";

describe("providerForChain", () => {
  it("routes Etherscan-free chains to Etherscan", () => {
    expect(providerForChain(1)).toBe("etherscan");
    expect(providerForChain(137)).toBe("etherscan");
    expect(providerForChain(42161)).toBe("etherscan");
    expect(providerForChain(59144)).toBe("etherscan");
  });

  it("routes the chains Etherscan charges for to Blockscout", () => {
    expect(providerForChain(10)).toBe("blockscout");
    expect(providerForChain(100)).toBe("blockscout");
  });

  it("answers null for chains no free plan covers", () => {
    expect(providerForChain(8453)).toBeNull();
    expect(providerForChain(56)).toBeNull();
    expect(providerForChain(43114)).toBeNull();
  });

  it("names the paid-chain offenders in the honest message", () => {
    expect(unsupportedChainMessage(8453)).toContain("Base");
    expect(unsupportedChainMessage(8453)).toContain("paid");
    expect(unsupportedChainMessage(31337)).toContain("31337");
  });
});
