/**
 * Shared call gating and retry pacing for third-party indexers.
 * Rate limits are metered per API key across every chain and every
 * concurrent run in this process, so clients built for different
 * chains queue through one gate keyed by the key.
 *
 * The gate has two lanes. `live` is the interactive lane - the head
 * poll, a balance check - calls a user is waiting on. `bulk` is the
 * walk lane: backfills, re-decodes and anything that streams window
 * after window. A walk can hold the gate for minutes; without lanes, a
 * poll queued behind two walk steps waits out its timeout and the
 * poller parks while the retrofit happily keeps chewing blocks. The
 * pump always drains the live lane first, so a poll waits at most one
 * in-flight call, not a whole walk.
 */
export const RETRY_DELAYS_MS = [2_000, 8_000, 32_000];

export type GateLane = "live" | "bulk";

interface Entry {
  lane: GateLane;
  fn: () => Promise<unknown>;
  settle: (value?: unknown, error?: unknown) => void;
}

interface Gate {
  busy: boolean;
  queue: Entry[];
}

const gates = new Map<string, Gate>();

/** Run `fn` once this key's gate is free, live lane first. */
export function gated<T>(
  key: string,
  lane: GateLane,
  fn: () => Promise<T>,
): Promise<T> {
  let gate = gates.get(key);
  if (!gate) {
    gate = { busy: false, queue: [] };
    gates.set(key, gate);
  }
  const g = gate;
  return new Promise<T>((resolve, reject) => {
    g.queue.push({
      lane,
      fn: fn,
      settle: (value, error) => (error !== undefined ? reject(error) : resolve(value as T)),
    });
    if (!g.busy) pump(g);
  });
}

function pump(gate: Gate): void {
  const at = gate.queue.findIndex((entry) => entry.lane === "live");
  const [entry] = gate.queue.splice(at >= 0 ? at : 0, 1);
  if (!entry) {
    gate.busy = false;
    return;
  }
  gate.busy = true;
  entry
    .fn()
    .then((value) => entry.settle(value), (error) => entry.settle(undefined, error))
    .then(() => pump(gate));
}
