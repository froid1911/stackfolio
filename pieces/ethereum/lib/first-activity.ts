import type { ClientBundle } from "./client.js";

/**
 * The block an account first showed signs of life, found by binary search
 * (which skips dead chain): at each probe a block is
 * "active" when the account holds balance there or has already sent a
 * transaction. Balance and nonce are monotone enough for this - money in
 * and first out both flip the test from false to true forever after, so
 * the lowest active block is within one step of the first real event, and
 * the caller leaves a lag behind it to be safe.
 */

/** Blocks of slack kept behind the discovered first activity. */
export const FIRST_ACTIVITY_LAG_BLOCKS = 2_000n;

/**
 * The lowest block whose state shows the account alive, minus a safety
 * lag, clamped to 0. `head` when the account has never been active - the
 * live window will meet its first event as it happens.
 */
export async function findFirstActivity(
  clients: Pick<ClientBundle, "getBalance" | "getNonce">,
  account: string,
  head: bigint,
): Promise<bigint> {
  // A snap-sync node refuses state older than its window (missing trie
  // node); an unanswerable probe counts as "not provably active", so the
  // search lands at the oldest block this node can still read.
  const active = async (block: bigint): Promise<boolean> => {
    const [balance, nonce] = await Promise.all([
      clients.getBalance(account, block).catch(() => 0n),
      clients.getNonce(account, block).catch(() => 0),
    ]);
    return balance > 0n || nonce > 0;
  };
  if (!(await active(head))) return head;
  // head is active, so the invariant holds at the top.
  let low = 0n;
  let high = head;
  while (low < high) {
    const mid = (low + high) / 2n;
    if (await active(mid)) high = mid;
    else low = mid + 1n;
  }
  return low > FIRST_ACTIVITY_LAG_BLOCKS ? low - FIRST_ACTIVITY_LAG_BLOCKS : 0n;
}
