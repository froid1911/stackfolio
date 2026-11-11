import { describe, expect, it } from "vitest";
import { planSetup } from "./setup.js";

const file = (id: string) => ({ kind: "file" as const, id });

describe("planSetup", () => {
  it("adopts every singleton that exists and creates nothing", () => {
    const types = new Map([
      ["p1", "stackfolio/portfolio"],
      ["r1", "stackfolio/asset-registry"],
      ["b1", "stackfolio/price-book"],
    ]);
    const plan = planSetup(
      [file("p1"), file("r1"), file("b1")],
      (id) => types.get(id),
    );
    expect(plan.existing.portfolio).toBe("p1");
    expect(plan.existing.registry).toBe("r1");
    expect(plan.existing.priceBook).toBe("b1");
    expect(plan.toCreate).toEqual([]);
    expect(plan.ready).toBe(true);
  });

  it("creates only the missing singletons on a partial drive", () => {
    const types = new Map([["r1", "stackfolio/asset-registry"]]);
    const plan = planSetup([file("r1")], (id) => types.get(id));
    expect(plan.toCreate).toEqual(["portfolio", "priceBook"]);
    expect(plan.ready).toBe(false);
  });

  it("ignores folders and documents of other types", () => {
    const types = new Map([["x1", "powerhouse/document-drive"]]);
    const plan = planSetup(
      [
        { kind: "folder" as const, id: "f1" },
        file("x1"),
      ],
      (id) => types.get(id),
    );
    expect(plan.toCreate).toEqual(["portfolio", "registry", "priceBook"]);
    expect(plan.ready).toBe(false);
  });

  it("adopts the first portfolio when several exist", () => {
    const types = new Map([
      ["p1", "stackfolio/portfolio"],
      ["p2", "stackfolio/portfolio"],
    ]);
    const plan = planSetup([file("p2"), file("p1")], (id) => types.get(id));
    expect(plan.existing.portfolio).toBeTruthy();
    expect(plan.toCreate).not.toContain("portfolio");
  });
});
