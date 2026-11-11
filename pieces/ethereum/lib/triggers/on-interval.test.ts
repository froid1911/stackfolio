import { describe, expect, it } from "vitest";

import { createMockPollingTriggerContext } from "@powerhousedao/pieces-framework";

import { ethereumOnIntervalTrigger } from "./on-interval.js";

const run = ethereumOnIntervalTrigger.run as unknown as (
  ctx: unknown,
) => Promise<Array<Record<string, unknown>>>;

describe("on-interval trigger", () => {
  it("fires with a timestamp and asks for its own schedule", async () => {
    const schedules: unknown[] = [];
    const context = createMockPollingTriggerContext({
      propsValue: { seconds: 900, label: "live-scan-w1" },
      onSetSchedule: (schedule) => schedules.push(schedule),
    });

    const payload = await run(context);

    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ label: "live-scan-w1" });
    expect(Date.parse(String(payload[0].firedAt))).not.toBeNaN();
    expect(schedules).toEqual([{ intervalMs: 900_000 }]);
  });

  it("defaults to five minutes", async () => {
    const schedules: unknown[] = [];
    const context = createMockPollingTriggerContext({
      propsValue: {},
      onSetSchedule: (schedule) => schedules.push(schedule),
    });

    const payload = await run(context);

    expect(payload[0]).toMatchObject({ label: "tick" });
    expect(schedules).toEqual([{ intervalMs: 300_000 }]);
  });
});
