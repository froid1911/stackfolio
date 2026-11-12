import { createAction, Property } from "@powerhousedao/pieces-framework";
import { beaconGet, beaconPost } from "../beacon.js";
import { ethereumAuth } from "../auth.js";
import { authProps } from "../client.js";
import { parseJsonish } from "../jsonish.js";

const FAR_FUTURE = 1n << 63n;
const SECONDS_PER_EPOCH = 32n * 12n;

interface BeaconValidatorData {
  index?: unknown;
  balance?: unknown;
  validator?: {
    pubkey?: unknown;
    withdrawal_credentials?: unknown;
    activation_epoch?: unknown;
    exit_epoch?: unknown;
    withdrawable_epoch?: unknown;
    activation_timestamp?: unknown;
  };
}

interface ValidatorRow {
  index: number;
  publicKey: string;
  withdrawalAddress: string | null;
  activationTimestamp: string | null;
  withdrawableTimestamp: string | null;
  exitedTimestamp: string | null;
}

/** Withdrawal credentials only encode an address for ETH1 (0x01) and
 *compounded (0x02) sets; legacy 0x00 and EIP-7002 0x04 give null. */
function withdrawalAddress(credentials: unknown): string | null {
  if (typeof credentials !== "string") return null;
  const hex = credentials.toLowerCase();
  if (!/^0x0[12][0-9a-f]{62}$/.test(hex)) return null;
  return `0x${hex.slice(-40)}`;
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string") {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  return null;
}

function epochTime(
  epoch: unknown,
  genesisTime: number | null,
): string | null {
  if (genesisTime === null) return null;
  const value = toBigInt(epoch);
  // Epoch 0 is real (the genesis set activates at genesis itself); only
  // negatives and the FAR_FUTURE sentinel mean "not happened".
  if (value === null || value < 0n || value >= FAR_FUTURE) return null;
  const seconds = BigInt(genesisTime) + value * SECONDS_PER_EPOCH;
  return new Date(Number(seconds) * 1000).toISOString();
}

/**
 * Head view of a set of beacon-chain validators plus today's balance
 * snapshot. The beacon API keeps no per-validator balance history, so the
 * action records the snapshot it sees; the staking document accumulates the
 * history run over run.
 */
export const ethereumFetchValidatorsAction = createAction({
  auth: ethereumAuth,
  // Saved workflows refer to the action by name: don't rename it once published
  name: "fetch-validators",
  displayName: "Fetch Validators",
  description:
    "Read validator keys, withdrawal addresses and the current head balance for validator indices - and for every validator whose withdrawal address belongs to the portfolio (the beacon resolves address to index). Unreachable beacon? The run reports the error instead of throwing, so schedulers keep their cadence.",
  props: {
    indicesJson: Property.Json({
      displayName: "Validator indices (JSON)",
      description: 'A JSON array of validator indices, e.g. [7,9,11].',
      required: false,
    }),
    withdrawalAddressesJson: Property.Json({
      displayName: "Withdrawal addresses (JSON)",
      description:
        'A JSON array of ETH1 withdrawal addresses; the beacon resolves each to its validator set ["0x9e5b…"].',
      required: false,
    }),
    hour: Property.ShortText({
      displayName: "Run hour (ISO timestamp)",
      description:
        "The bucket the balance snapshot is recorded under; its date becomes the balance day.",
      required: true,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    const parseOptArray = (value: unknown, prop: string): unknown[] => {
      if (value === undefined || value === null) return [];
      const parsed = parseJsonish(value, prop);
      if (!Array.isArray(parsed)) {
        throw new Error(`${prop} must be a JSON array.`);
      }
      return parsed;
    };
    const indices = parseOptArray(p.indicesJson, "indicesJson");
    const addresses = parseOptArray(
      p.withdrawalAddressesJson,
      "withdrawalAddressesJson",
    );
    const hour = p.hour;
    // The day stamp must be a date; anything else (a workflow template
    // left unresolved, a stray word) would poison every balance point's
    // day, so it fails loudly instead of silently.
    if (!/^\d{4}-\d{2}-\d{2}/.test(hour) || !Number.isFinite(Date.parse(hour))) {
      throw new Error(
        `hour must be an ISO timestamp, e.g. 2026-11-11T10:00:00.000Z, got "${hour}".`,
      );
    }
    const day = hour.slice(0, 10);

    const baseUrl =
      authProps(context.auth).beaconUrl?.trim() || "http://127.0.0.1:5052";

    const validators: ValidatorRow[] = [];
    const balances: Array<{
      validatorIndex: number;
      day: string;
      balanceGwei: number;
    }> = [];
    const errors: string[] = [];
    const seen = new Set<number>();

    const pushRow = (data: BeaconValidatorData, fallbackIndex: number | null) => {
      const index = Number(data.index ?? fallbackIndex);
      if (!Number.isInteger(index) || index < 0 || seen.has(index)) return;
      seen.add(index);
      const validator = data.validator ?? {};
      const withdrawable = epochTime(validator.withdrawable_epoch, genesisTime);
      validators.push({
        index,
        publicKey:
          typeof validator.pubkey === "string" ? validator.pubkey : "",
        withdrawalAddress: withdrawalAddress(validator.withdrawal_credentials),
        // A beacon that serves activation_timestamp (Lighthouse) wins;
        // Prysm does not, so fall back to the epoch the way the exit and
        // withdrawable timestamps are computed. Without this every
        // validator read from Prysm looked "pending" forever.
        activationTimestamp:
          validator.activation_timestamp === undefined ||
          validator.activation_timestamp === null ||
          validator.activation_timestamp === ""
            ? epochTime(validator.activation_epoch, genesisTime)
            : new Date(Number(validator.activation_timestamp) * 1000).toISOString(),
        withdrawableTimestamp: withdrawable,
        // A set exit epoch means the validator left; the closest honest
        // timestamp we have is when its balance becomes withdrawable.
        exitedTimestamp:
          (toBigInt(validator.exit_epoch) ?? FAR_FUTURE) >= FAR_FUTURE
            ? null
            : withdrawable,
      });
      balances.push({
        validatorIndex: index,
        day,
        balanceGwei: Number(data.balance ?? 0),
      });
    };

    let genesisTime: number | null = null;
    if (indices.length > 0 || addresses.length > 0) {
      try {
        const genesis = await beaconGet<{ genesis_time?: string }>(
          "/eth/v1/beacon/genesis",
          baseUrl,
        );
        const parsed = Number(genesis.genesis_time);
        genesisTime = Number.isFinite(parsed) ? parsed : null;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (addresses.length > 0) {
      // ETH1 (0x01) and compound (0x02) credentials embed the address.
      // Some beacons (Prysm) reject a 32-byte id that isn't a BLS public
      // key, so the address lookup is a scan of the head validator set;
      // only the Prysm id path is tried first, and only for 0x01.
      const wanted = new Map<string, string>(); // last-40 hex -> address
      const skipped = new Set<string>(); // resolved by the id probe
      for (const address of addresses) {
        if (typeof address !== "string") continue;
        const hex = address.toLowerCase().replace(/^0x/, "");
        if (!/^[0-9a-f]{40}$/.test(hex)) {
          errors.push(`withdrawal address ${address} is malformed`);
          continue;
        }
        wanted.set(hex, address);
        const eth1 = `0x01${"0".repeat(24)}${hex}`;
        try {
          const list = await beaconGet<BeaconValidatorData[]>(
            `/eth/v1/beacon/states/head/validators?id=${eth1}`,
            baseUrl,
          );
          for (const entry of list) pushRow(entry, null);
          if (list.length > 0) skipped.add(hex);
        } catch {
          // no id support for credential ids - the scan below covers it
        }
      }
      const scanWanted = new Map(
        [...wanted].filter(([hex]) => !skipped.has(hex)),
      );
      const seenHex = new Set<string>(); // found by the scan
      if (scanWanted.size > 0) {
        // One pass of paged POSTs over the head set (a GET id list of a
        // hundred thousand indices overflows both the URL limit and the
        // response size a string can hold); each page is matched against
        // every wanted address at once. A failing page names the
        // addresses still unfound: everything before it was scanned.
        const page = 100_000;
        for (let from = 0; ; from += page) {
          // The beacon API's ids are strings: index text, pubkey hex or
          // credential hex - bare numbers are a 400.
          const ids = Array.from({ length: page }, (_, i) => String(from + i));
          let list: BeaconValidatorData[];
          try {
            list = await beaconPost<BeaconValidatorData[]>(
              "/eth/v1/beacon/states/head/validators",
              baseUrl,
              { ids, statuses: [] },
            );
          } catch (error) {
            const lost = [...scanWanted.entries()].filter(
              ([hex]) => !seenHex.has(hex),
            );
            if (lost.length > 0) {
              errors.push(
                `validators by ${lost.map(([, a]) => a).join(", ")}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
            break;
          }
          if (list.length === 0) break;
          for (const entry of list) {
            const credential = entry.validator?.withdrawal_credentials;
            if (typeof credential !== "string") continue;
            const tail = credential.toLowerCase().slice(-40);
            if (scanWanted.has(tail)) {
              seenHex.add(tail);
              pushRow(entry, null);
            }
          }
          if (list.length < ids.length) break; // scanned past the tip
        }
      }
    }

    for (const entry of indices) {
      const index = typeof entry === "number" ? entry : Number(entry);
      if (!Number.isInteger(index) || index < 0 || seen.has(index)) continue;
      try {
        const data = await beaconGet<BeaconValidatorData>(
          `/eth/v1/beacon/states/head/validators/${index}`,
          baseUrl,
        );
        pushRow(data, index);
      } catch (error) {
        errors.push(
          `validator ${index}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      validators,
      balances,
      error: errors.length > 0 ? errors.join("; ") : null,
    };
  },
});
