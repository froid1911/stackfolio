import { describe, expect, it } from "vitest";
import { dayWindow, direction, manualPins, parsePrice } from "./review.js";

describe("direction", () => {
  it("follows the holdings sign table", () => {
    expect(direction("RECEIVE")).toBe("in");
    expect(direction("STAKING")).toBe("in");
    expect(direction("SPEND")).toBe("out");
    for (const t of ["TRADE", "TRANSFER", "MIGRATE", "INFORMATIONAL"]) {
      expect(direction(t)).toBe("neutral");
    }
  });
});

describe("parsePrice", () => {
  it("accepts what the reducer accepts, and a decimal comma", () => {
    expect(parsePrice("2500.5")).toBe("2500.5");
    expect(parsePrice(" 2500,50 ")).toBe("2500.50");
    expect(parsePrice("0")).toBe("0");
  });

  it("refuses anything the reducer would reject", () => {
    for (const bad of ["", "-1", "1e3", "1,000.5", "01", "abc", "1."]) {
      expect(parsePrice(bad), bad).toBeNull();
    }
  });
});

describe("dayWindow", () => {
  it("spans the event's UTC day", () => {
    expect(dayWindow("2026-11-13T13:54:11Z")).toEqual({
      from: "2026-11-13T00:00:00.000Z",
      to: "2026-11-13T23:59:59.999Z",
    });
  });
});

describe("manualPins", () => {
  const event = { documentId: "w1", eventId: "e1", sequenceIndex: 0 };
  const now = "2026-11-13T22:00:00.000Z";

  it("pins one leg as a manual price in the portfolio currency", () => {
    expect(manualPins([event], "62255", "EUR", now)).toEqual({
      events: [
        {
          id: "e1",
          sequenceIndex: 0,
          valuation: { unit: "EUR", price: "62255", source: "MANUAL", granularity: "NONE", pinnedAt: now },
        },
      ],
    });
  });

  it("pins only legs of the same wallet document, once each", () => {
    const legs = [
      event,
      { documentId: "w1", eventId: "e2", sequenceIndex: 1 },
      { documentId: "w1", eventId: "e2", sequenceIndex: 1 },
      { documentId: "w2", eventId: "e9", sequenceIndex: 0 },
    ];
    const pins = manualPins(legs, "1", "EUR", now, "w1");
    expect(pins.events.map((p) => `${p.id}:${p.sequenceIndex}`)).toEqual(["e1:0", "e2:1"]);
  });
});
