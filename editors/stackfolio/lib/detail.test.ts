import { describe, expect, it } from "vitest";
import { resolveDetail } from "./detail.js";

const IDS = ["0xAbC123", "eip155:1/erc20:0xDai", "ev-9_Xy"];

describe("resolveDetail", () => {
  it("resolves an account detail against live addresses", () => {
    expect(resolveDetail("balances", "account:0xabc123", IDS)).toEqual({
      kind: "account",
      slug: "0xabc123",
      id: "0xAbC123",
    });
  });

  it("tolerates separator swaps the slug codec allows", () => {
    expect(resolveDetail("assets", "asset:eip155-1-erc20-0xdai", IDS)?.id).toBe(
      "eip155:1/erc20:0xDai",
    );
  });

  it("an unknown id keeps the slug and resolves nothing", () => {
    const d = resolveDetail("history", "event:gone", IDS);
    expect(d).toEqual({ kind: "event", slug: "gone", id: undefined });
  });

  it("a page that declares no details ignores the param", () => {
    expect(resolveDetail("dashboard", "asset:whatever", IDS)).toBeUndefined();
    expect(resolveDetail("pnl", "account:0xabc123", IDS)).toBeUndefined();
  });

  it("an unknown kind is ignored", () => {
    expect(resolveDetail("balances", "validator:0xabc123", IDS)).toBeUndefined();
  });

  it("a missing kind suffix is ignored (bare slug)", () => {
    expect(resolveDetail("balances", "0xabc123", IDS)).toBeUndefined();
  });

  it("no detail is no detail", () => {
    expect(resolveDetail("balances", undefined, IDS)).toBeUndefined();
  });

  it("balances accepts both account and asset kinds", () => {
    expect(resolveDetail("balances", "asset:eip155-1-erc20-0xdai", IDS)?.id).toBe(
      "eip155:1/erc20:0xDai",
    );
    expect(resolveDetail("balances", "account:0xabc123", IDS)?.id).toBe("0xAbC123");
  });

  it("history names events, address-book accounts only", () => {
    expect(resolveDetail("history", "event:ev-9-xy", IDS)?.id).toBe("ev-9_Xy");
    expect(resolveDetail("address-book", "event:ev-9-xy", IDS)).toBeUndefined();
  });
});
