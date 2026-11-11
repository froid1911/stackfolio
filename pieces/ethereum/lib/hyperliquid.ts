/**
 * The Hyperliquid public info-API client: spot balances, perp positions
 * and recent fills for one address. The API is a single POST endpoint
 * (`/info`) selected by a `type` field; there is no key and no rate
 * header to lean on, so calls are spaced and transient pressure backs
 * off the same way the Etherscan client does. A rejected request (bad
 * address, bad payload) answers 4xx with a message and is fatal for the
 * address, not retryable.
 */

import { RETRY_DELAYS_MS } from "./gate.js";

export const DEFAULT_HYPERLIQUID_URL = "https://api.hyperliquid.xyz";

export class HyperliquidError extends Error {
  constructor(
    message: string,
    readonly category: "rejected" | "transient",
  ) {
    super(message);
    this.name = "HyperliquidError";
  }
}

/** The piece talks to the public API; the URL stays overridable for
 * mirrors and tests. No secrets on this connection to guard. */
export function hyperliquidConfig(auth: {
  hyperliquidUrl?: string;
}): { baseUrl: string } {
  return { baseUrl: auth.hyperliquidUrl?.trim() || DEFAULT_HYPERLIQUID_URL };
}

export interface HlSpotBalance {
  tokenIndex: number;
  coin: string;
  total: string;
  hold: string;
}

export interface HlPerpPosition {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
}

export interface HlFill {
  tid: number;
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  dir: string | null;
  fee: string | null;
  closedPnl: string | null;
}

export interface HlSnapshot {
  /** Perp margin account value in USD; Hyperliquid reports none for spot. */
  accountValueUsd: string | null;
  spot: HlSpotBalance[];
  perps: HlPerpPosition[];
  fills: HlFill[];
}

type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

export function createHyperliquidClient(opts: {
  baseUrl?: string;
  fetchImpl?: FetchFn;
  sleepFn?: (ms: number) => Promise<void>;
  spacingMs?: number;
}): { info(body: Record<string, unknown>): Promise<unknown> } {
  const doFetch = opts.fetchImpl ?? (fetch);
  const sleep =
    opts.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const spacingMs = opts.spacingMs ?? 250;
  const baseUrl = opts.baseUrl ?? DEFAULT_HYPERLIQUID_URL;
  let lastCallAt = 0;

  const info = async (body: Record<string, unknown>): Promise<unknown> => {
    let lastError: HyperliquidError | undefined;
    for (let tryNo = 0; tryNo <= RETRY_DELAYS_MS.length; tryNo += 1) {
      const wait = lastCallAt + spacingMs - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }
      lastCallAt = Date.now();
      if (tryNo > 0) {
        await sleep(RETRY_DELAYS_MS[tryNo - 1]);
      }
      let response: { status: number; json(): Promise<unknown> };
      try {
        response = await doFetch(`${baseUrl}/info`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        lastError = new HyperliquidError(
          "Hyperliquid did not answer in time.",
          "transient",
        );
        continue;
      }
      if (response.status === 429 || response.status >= 500) {
        lastError = new HyperliquidError(
          `Hyperliquid answered HTTP ${response.status}; backing off.`,
          "transient",
        );
        continue;
      }
      if (response.status >= 400) {
        let detail = "";
        try {
          const payload = (await response.json()) as {
            message?: string;
            http_request?: string;
          };
          detail = payload.message ?? payload.http_request ?? "";
        } catch {
          detail = "";
        }
        throw new HyperliquidError(
          `Hyperliquid rejected the request (HTTP ${response.status})${detail ? `: ${detail}` : ""}.`,
          "rejected",
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        lastError = new HyperliquidError(
          "Hyperliquid answered with a non-JSON body.",
          "transient",
        );
        continue;
      }
      return payload;
    }
    throw lastError ?? new HyperliquidError("Hyperliquid call failed.", "transient");
  };

  return { info };
}

type HlClient = { info(body: Record<string, unknown>): Promise<unknown> };

/** EVM addresses only: Hyperliquid knows nothing else. Case-insensitive
 * for the prefix, matching the reducer that stores the address. */
export function isHlAddress(address: string): boolean {
  return /^0x[0-9a-f]{40}$/i.test(address);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> =>
        typeof row === "object" && row !== null,
      )
    : [];
}

/** token id -> coin name, from the spot universe; tokens that vanished
 * from it keep their numeric name. */
async function spotNames(client: HlClient): Promise<Map<number, string>> {
  const meta = await client.info({ type: "spotMeta" });
  const names = new Map<number, string>();
  for (const listing of asStringList(
    (meta as Record<string, unknown>)?.universe,
  )) {
    const tokenId = asNumber(listing.tokenId, -1);
    const name = asString(listing.name, "");
    if (tokenId >= 0 && name !== "") {
      names.set(tokenId, name);
    }
  }
  return names;
}

function nonzero(value: string): boolean {
  return value !== "" && Number(value) !== 0;
}

/**
 * One account's view: spot balances (named, dust skipped), open perp
 * positions and the recent fills. Every field is the exchange's own
 * string; no rounding happens here. A zero balance or a flat position
 * is noise and never returned.
 */
export async function fetchHlSnapshot(
  client: HlClient,
  address: string,
): Promise<HlSnapshot> {
  const user = address.toLowerCase();
  const names = await spotNames(client);
  const spotPayload = (await client.info({
    type: "spotClearinghouseState",
    user,
  })) as Record<string, unknown>;
  const spot: HlSpotBalance[] = [];
  for (const row of asStringList(spotPayload?.balances)) {
    const tokenIndex = asNumber(row.token, -1);
    const total = asString(row.total, "");
    const hold = asString(row.hold, "0");
    if (tokenIndex < 0 || (!nonzero(total) && !nonzero(hold))) continue;
    spot.push({
      tokenIndex,
      coin: names.get(tokenIndex) ?? String(tokenIndex),
      total,
      hold,
    });
  }
  const perpPayload = (await client.info({
    type: "clearinghouseState",
    user,
  })) as Record<string, unknown>;
  const margin = (perpPayload?.marginSummary ?? {}) as Record<string, unknown>;
  const accountValueUsd =
    typeof margin.accountValue === "string" ? margin.accountValue : null;
  const perps: HlPerpPosition[] = [];
  for (const wrapper of asStringList(perpPayload?.assetPositions)) {
    const position = (wrapper.position ?? {}) as Record<string, unknown>;
    const szi = asString(position.szi, "");
    if (szi === "" || !nonzero(szi)) continue;
    perps.push({
      coin: asString(position.coin, ""),
      szi,
      entryPx: asString(position.entryPx, "0"),
      positionValue: asString(position.positionValue, "0"),
      unrealizedPnl: asString(position.unrealizedPnl, "0"),
    });
  }
  const fillsPayload = await client.info({ type: "userFills", user });
  const fills: HlFill[] = [];
  for (const row of asStringList(fillsPayload)) {
    const tid = asNumber(row.tid, -1);
    const time = asNumber(row.time, -1);
    const coin = asString(row.coin, "");
    if (tid < 0 || time < 0 || coin === "") continue;
    fills.push({
      tid,
      coin,
      side: asString(row.side, ""),
      px: asString(row.px, "0"),
      sz: asString(row.szDiff ?? row.sz, "0"),
      time,
      dir: typeof row.dir === "string" ? row.dir : null,
      fee: typeof row.fee === "string" ? row.fee : null,
      closedPnl: typeof row.closedPnl === "string" ? row.closedPnl : null,
    });
  }
  return { accountValueUsd, spot, perps, fills };
}
