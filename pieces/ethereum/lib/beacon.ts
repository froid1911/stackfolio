/**
 * Minimal read-only beacon-chain API client. Every response body follows the
 * standard beacon API envelope `{ data: ... }`; only `data` is returned.
 */

export interface BeaconResponse {
  ok: boolean;
  status: number;
  json(): unknown;
}

export type BeaconFetch = (url: string) => Promise<BeaconResponse>;

export async function beaconGet<T>(
  path: string,
  baseUrl: string,
  fetchImpl: BeaconFetch = (url) => fetch(url),
): Promise<T> {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`);
  if (!response.ok) {
    throw new Error(`beacon ${path} answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: T };
  if (body.data === undefined) {
    throw new Error(`beacon ${path} returned no data envelope`);
  }
  return body.data;
}

/** POST with a JSON body; same `{ data }` envelope. */
export async function beaconPost<T>(
  path: string,
  baseUrl: string,
  payload: unknown,
  fetchImpl: (
    url: string,
    init: { method: string; body: string },
  ) => Promise<BeaconResponse> = (url, init) =>
    fetch(url, init),
): Promise<T> {
  const response = await fetchImpl(
    `${baseUrl.replace(/\/$/, "")}${path}`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!response.ok) {
    throw new Error(`beacon ${path} answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: T };
  if (body.data === undefined) {
    throw new Error(`beacon ${path} returned no data envelope`);
  }
  return body.data;
}
