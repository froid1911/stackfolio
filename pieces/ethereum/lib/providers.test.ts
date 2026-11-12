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

  it("routes the gap chains to Ankr's freemium roster", () => {
    expect(providerForChain(8453)).toBe("ankr");
    expect(providerForChain(56)).toBe("ankr");
    expect(providerForChain(43114)).toBe("ankr");
  });

  it("answers null for chains no free plan covers", () => {
    expect(providerForChain(1284)).toBeNull();
    expect(providerForChain(31337)).toBeNull();
  });

  it("says plainly why an unsupported chain is unsupported", () => {
    expect(unsupportedChainMessage(1284)).toContain("1284");
    expect(unsupportedChainMessage(31337)).toContain("31337");
    expect(unsupportedChainMessage(31337)).toContain("No free import");
  });
});
