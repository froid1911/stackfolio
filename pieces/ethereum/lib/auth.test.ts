import { describe, expect, it } from "vitest";
import { etherscanConfig } from "./auth.js";

describe("etherscanConfig", () => {
  it("returns the trimmed key and the default base URL", () => {
    const { apiKey, baseUrl } = etherscanConfig({
      etherscanApiKey: "  test-key-123  ",
    });
    expect(apiKey).toBe("test-key-123");
    expect(baseUrl).toBe("https://api.etherscan.io/v2/api");
  });

  it("honors a custom base URL", () => {
    const { baseUrl } = etherscanConfig({
      etherscanApiKey: "test-key-123",
      etherscanBaseUrl: " https://example.com/v2/api ",
    });
    expect(baseUrl).toBe("https://example.com/v2/api");
  });

  it("throws the connection-pointing error when the key is missing or blank", () => {
    const message =
      "Etherscan API key is not set - set it on the ethereum connection (Stackfolio reads it from there)";
    expect(() => etherscanConfig({})).toThrow(message);
    expect(() => etherscanConfig({ etherscanApiKey: "   " })).toThrow(
      message,
    );
    expect(() =>
      etherscanConfig({ etherscanApiKey: undefined }),
    ).toThrow(message);
  });
});
