import { describe, expect, it } from "vitest";
import { legacyPage, pageParam } from "./nav.js";

describe("page addressing", () => {
  it("maps legacy tab names onto pages", () => {
    expect(legacyPage("transactions")).toBe("history");
    expect(legacyPage("accounts")).toBe("balances");
    expect(legacyPage("pnl")).toBe("pnl");
    expect(legacyPage("anything-else")).toBeUndefined();
    expect(legacyPage(undefined)).toBeUndefined();
  });

  it("prefers ?page= over the legacy ?tab=", () => {
    expect(pageParam({ page: "assets", tab: "pnl" })).toBe("assets");
    expect(pageParam({ tab: "pnl" })).toBe("pnl");
    expect(pageParam({ page: "bogus", tab: "pnl" })).toBe("pnl");
    expect(pageParam({})).toBeUndefined();
  });
});
