import { describe, expect, it } from "vitest";
import { isPage, NAV_ENTRIES } from "./nav.js";

describe("nav", () => {
  it("accepts known pages", () => {
    expect(isPage("balances")).toBe(true);
    expect(isPage("dashboard")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPage("nonsense")).toBe(false);
    expect(isPage(7)).toBe(false);
    expect(isPage(undefined)).toBe(false);
  });

  it("lists each page once", () => {
    const pages = NAV_ENTRIES.map((e) => e.page);
    expect(new Set(pages).size).toBe(pages.length);
  });

  it("orders the Overview section", () => {
    expect(
      NAV_ENTRIES.filter((e) => e.section === "Overview").map((e) => e.page),
    ).toEqual(["dashboard", "balances", "history", "pnl", "staking"]);
  });

  it("orders the Manage section", () => {
    expect(
      NAV_ENTRIES.filter((e) => e.section === "Manage").map((e) => e.page),
    ).toEqual(["address-book", "assets", "prices", "defi"]);
  });
});
