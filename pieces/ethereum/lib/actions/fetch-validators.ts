import { createAction, Property } from "@powerhousedao/pieces-framework";
import { beaconGet } from "../beacon.js";
import { ethereumAuth } from "../auth.js";

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
    "Read validator keys, withdrawal addresses and the current head balance for a list of validator indices from a beacon-chain node. Unreachable beacon? The run reports the error instead of throwing, so schedulers keep their cadence.",
  props: {
    indicesJson: Property.LongText({
      displayName: "Validator indices (JSON array)",
      description: 'A JSON array of validator indices, e.g. [7,9,11].',
      required: true,
    }),
    hour: Property.ShortText({
      displayName: "Run hour (ISO timestamp)",
      description:
        "The bucket the balance snapshot is recorded under; its date becomes the balance day.",
      required: true,
    }),
  },
  async run(context) {
    let indices: unknown;
    try {
      indices = JSON.parse(context.propsValue.indicesJson);
    } catch {
      throw new Error(
        "indicesJson must be a JSON array of validator indices.",
      );
    }
    if (!Array.isArray(indices)) {
      throw new Error("indicesJson must be a JSON array.");
    }
    const hour = context.propsValue.hour;
    if (!Number.isFinite(Date.parse(hour))) {
      throw new Error("hour must be an ISO timestamp, e.g. 2026-11-11T10:00:00.000Z.");
    }
    const day = hour.slice(0, 10);

    const baseUrl =
      context.auth.props.beaconUrl?.trim() || "http://127.0.0.1:5052";

    const validators: Array<{
      index: number;
      publicKey: string;
      withdrawalAddress: string | null;
      activationTimestamp: string | null;
      withdrawableTimestamp: string | null;
      exitedTimestamp: string | null;
    }> = [];
    const balances: Array<{
      validatorIndex: number;
      day: string;
      balanceGwei: number;
    }> = [];
    const errors: string[] = [];

    let genesisTime: number | null = null;
    if (indices.length > 0) {
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

    for (const entry of indices) {
      const index = typeof entry === "number" ? entry : Number(entry);
      if (!Number.isInteger(index) || index < 0) continue;
      try {
        const data = await beaconGet<BeaconValidatorData>(
          `/eth/v1/beacon/states/head/validators/${index}`,
          baseUrl,
        );
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
