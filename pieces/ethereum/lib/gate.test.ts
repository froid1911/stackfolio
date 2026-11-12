import { describe, expect, it } from "vitest";
import { gated } from "./gate.js";

const noSleep = () => Promise.resolve();

describe("the two-lane key gate", () => {
  it("runs live calls ahead of queued bulk calls", async () => {
    const order: string[] = [];
    let release!: () => void;
    const firstHeld = new Promise<void>((r) => {
      release = r;
    });
    const busy = gated("k1", "bulk", async () => {
      order.push("busy");
      await firstHeld;
    });
    // Let the first bulk call take the gate.
    await Promise.resolve();
    expect(order).toEqual(["busy"]);
    // Queue three bulk calls and then one live call behind it.
    const queued = [
      gated("k1", "bulk", async () => void order.push("bulk-1")),
      gated("k1", "bulk", async () => void order.push("bulk-2")),
      gated("k1", "bulk", async () => void order.push("bulk-3")),
    ];
    const live = gated("k1", "live", async () => void order.push("live"));
    release();
    await Promise.all([busy, ...queued, live]);
    // The live call waits only for the in-flight call, then jumps the
    // whole bulk queue.
    expect(order).toEqual(["busy", "live", "bulk-1", "bulk-2", "bulk-3"]);
  });

  it("keeps a rejected call from poisoning the queue", async () => {
    const failing = gated("k2", "bulk", async () => {
      throw new Error("nope");
    });
    await expect(failing).rejects.toThrow("nope");
    await expect(gated("k2", "live", async () => 7)).resolves.toBe(7);
  });

  it("meters each key on its own gate", async () => {
    let releaseB!: () => void;
    const held = new Promise<void>((r) => {
      releaseB = r;
    });
    const busyA = gated("keyA", "bulk", () => held);
    await Promise.resolve();
    let ran = false;
    const freeB = gated("keyB", "bulk", async () => {
      ran = true;
      return noSleep().then(() => 1);
    });
    expect(await freeB).toBe(1);
    expect(ran).toBe(true);
    releaseB();
    await busyA;
  });
});
