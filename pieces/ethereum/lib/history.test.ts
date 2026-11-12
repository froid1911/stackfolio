import { describe, expect, it, vi } from "vitest";

import { getDailyClose, toDecimal } from "./history.js";

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () => body,
  }) as Response;

describe("toDecimal", () => {
  it("renders floats as plain decimals, never exponent form", () => {
    expect(toDecimal(2.5)).toBe("2.5");
    expect(toDecimal(4000.005)).toBe("4000.005");
    expect(toDecimal(1e-8)).toBe("0.00000001");
    expect(toDecimal(0)).toBe("0");
  });
});

describe("getDailyClose", () => {
  it("reads the quote close for the day", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ eur: 2999.5 }));
    const price = await getDailyClose("ethereum", "2026-11-01", "eur", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(price).toBe("2999.5");
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain("/coins/ethereum/history");
    expect(url).toContain("date=01-11-2026");
    expect(url).toContain("vs_currency=eur");
  });

  it("answers null on a miss, an http failure or a bad body", async () => {
    const miss = await getDailyClose("nope", "2026-11-01", "eur", {
      fetchImpl: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "coin not found" }, 404),
        ) as unknown as typeof fetch,
    });
    expect(miss).toBeNull();
    const throwing = await getDailyClose("x", "2026-11-01", "eur", {
      fetchImpl: vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch,
    });
    expect(throwing).toBeNull();
    const junk = await getDailyClose("x", "2026-11-01", "eur", {
      fetchImpl: vi
        .fn()
        .mockResolvedValue(jsonResponse({ usd: "not-a-number" })) as unknown as typeof fetch,
    });
    expect(junk).toBeNull();
  });
});
