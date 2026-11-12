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
  if (value === null || value <= 0n || value >= FAR_FUTURE) return null;
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
    if (!Number.isFinite(Date.parse(hour))) {
      throw new Error(
        "hour must be an ISO timestamp, e.g. 2026-11-11T10:00:00.000Z.",
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
        activationTimestamp:
          validator.activation_timestamp === undefined ||
          validator.activation_timestamp === null ||
          validator.activation_timestamp === ""
            ? null
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
      // ETH1 (0x01) and compound (0x02) credentials embed the address, and
      // the id filter usually resolves them. Prysm rejects 32-byte
      // credential ids that aren't BLS public keys (HTTP 400 on 0x02), so
      // rejected addresses are resolved afterwards by one bounded
      // client-side scan of the head validator set.
      const hexes = new Map<string, string[]>(); // address -> failed credentials
      for (const address of addresses) {
        if (typeof address !== "string") continue;
        const hex = address.toLowerCase().replace(/^0x/, "");
        if (!/^[0-9a-f]{40}$/.test(hex)) {
          errors.push(`withdrawal address ${address} is malformed`);
          continue;
        }
        for (const prefix of ["0x01", "0x02"]) {
          const credentials = `${prefix}${"0".repeat(24)}${hex}`;
          try {
            const list = await beaconGet<BeaconValidatorData[]>(
              `/eth/v1/beacon/states/head/validators?id=${credentials}`,
              baseUrl,
            );
            for (const entry of list) pushRow(entry, null);
          } catch {
            (hexes.get(hex) ?? hexes.set(hex, []).get(hex)!).push(credentials);
          }
        }
      }
      if (hexes.size > 0) {
        const wanted = new Set(hexes.keys());
        try {
          for (let start = 0; ; start += 50_000) {
            const ids = Array.from({ length: 50_000 }, (_, i) => start + i);
            const list = await beaconGet<BeaconValidatorData[]>(
              `/eth/v1/beacon/states/head/validators?id=${ids.join(",")}`,
              baseUrl,
            );
            if (list.length === 0) break;
            for (const entry of list) {
              const credential = entry.validator?.withdrawal_credentials;
              if (
                typeof credential === "string" &&
                wanted.has(credential.toLowerCase().slice(-40))
              ) {
                pushRow(entry, null);
              }
            }
            if (list.length < ids.length) break; // scanned past the tip
          }
        } catch (error) {
          for (const failed of hexes.values()) {
            errors.push(
              `validators by ${failed.join(", ")}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
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
