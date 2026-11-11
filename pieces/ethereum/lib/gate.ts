/**
 * Shared call gating and retry pacing for third-party indexers.
 * Rate limits are metered per API key across every chain and every
 * concurrent run in this process, so clients built for different
 * chains queue through one gate keyed by the key.
 */
export const RETRY_DELAYS_MS = [2_000, 8_000, 32_000];

export const keyGates = new Map<string, Promise<void>>();
