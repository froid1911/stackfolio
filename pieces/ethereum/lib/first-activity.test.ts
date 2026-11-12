import { describe, expect, it } from "vitest";
import { FIRST_ACTIVITY_LAG_BLOCKS, findFirstActivity } from "./first-activity.js";

/** A chain that came alive at `birth`: balance from there on. */
const chainAliveFrom = (birth: bigint) => ({
  getBalance: async (_a: string, block?: bigint) =>
    (block ?? 1_000n) >= birth ? 1_000n : 0n,
  getNonce: async (_a: string, block?: bigint) =>
    (block ?? 1_000n) >= birth ? 1 : 0,
});

describe("findFirstActivity", () => {
  it("narrows to the birth block minus the lag", async () => {
    const birth = 1_000_000n;
    const start = await findFirstActivity(chainAliveFrom(birth), "0xacdc", 2_000_000n);
    expect(start).toBe(birth - FIRST_ACTIVITY_LAG_BLOCKS);
  });

  it("lands at zero when the account predates the lag window", async () => {
    expect(await findFirstActivity(chainAliveFrom(500n), "0xacdc", 2_000_000n)).toBe(0n);
  });

  it("hands back head for an account that has never been active", async () => {
    const never = {
      getBalance: async () => 0n,
      getNonce: async () => 0,
    };
    expect(await findFirstActivity(never, "0xdead", 5_000_000n)).toBe(5_000_000n);
  });

  it("lands on the readable window of a snap-sync node", async () => {
    // State reads fail below head-128 (missing trie node); the account is
    // live inside the window. Unanswerable probes are not "active", so
    // the search must settle at the window edge, never at genesis.
    const readableBelow = 2_000_000n - 128n;
    const snap = {
      getBalance: async (_a: string, block?: bigint) => {
        const b = block ?? 1_000n;
        if (b < readableBelow) throw new Error("missing trie node");
        return b >= readableBelow ? 5n : 0n;
      },
      getNonce: async (_a: string, block?: bigint) => {
        const b = block ?? 1_000n;
        if (b < readableBelow) throw new Error("missing trie node");
        return 1;
      },
    };
    const start = await findFirstActivity(snap, "0xacdc", 2_000_000n);
    expect(start).toBeGreaterThanOrEqual(readableBelow - FIRST_ACTIVITY_LAG_BLOCKS);
    expect(start).toBeLessThan(readableBelow + 128n);
  });

  it("probes logarithmically, not one block at a time", async () => {
    let probes = 0;
    const counting = {
      getBalance: async (a: string, b?: bigint) => {
        probes += 1;
        return chainAliveFrom(1_000_000n).getBalance(a, b);
      },
      getNonce: async (a: string, b?: bigint) =>
        chainAliveFrom(1_000_000n).getNonce(a, b),
    };
    await findFirstActivity(counting, "0xacdc", 26_000_000n);
    // One activity pass per step over log2(26M) ~ 25 steps; the head test
    // adds one more. Way under a linear walk, nowhere near a hundred.
    expect(probes).toBeLessThan(60);
  });
});
