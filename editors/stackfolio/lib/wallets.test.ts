import { describe, expect, it } from "vitest";
import { walletName } from "./wallets.js";

describe("walletName", () => {
  const address = "0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50";

  it("uses the label, with the chain after any but mainnet", () => {
    expect(walletName(address, "frankp.eth", null)).toBe("frankp.eth");
    expect(walletName(address, "frankp.eth", "Polygon")).toBe("frankp.eth (Polygon)");
  });

  it("shortens the address without a label", () => {
    expect(walletName(address, null, null)).toBe("0x5c64…ae50");
  });
});
