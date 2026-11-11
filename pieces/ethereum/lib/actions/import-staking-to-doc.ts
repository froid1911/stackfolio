import { createAction, Property } from "@powerhousedao/pieces-framework";
import { globalState, toGlobalAction } from "../reactor.js";

export const ETH_STAKING_TYPE = "stackfolio/eth-staking";

interface IncomingValidator {
  index: number;
  publicKey: string;
  withdrawalAddress: string | null;
  activationTimestamp: string | null;
  withdrawableTimestamp: string | null;
  exitedTimestamp: string | null;
}

interface StakingGlobalState {
  validators?: Array<{
    index: number;
    publicKey: string;
    withdrawalAddress?: string | null;
    activationTimestamp?: number | null;
    withdrawableTimestamp?: number | null;
    exitedTimestamp?: number | null;
  }>;
  balanceHistory?: Array<{
    validatorIndex: number;
    day: string;
    balanceGwei: string;
  }>;
  withdrawals?: Array<{ withdrawalRef: number }>;
}

function epochSeconds(iso: string | null | undefined): number | null {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function parseArray(json: string, prop: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`${prop} must be a JSON array.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${prop} must be a JSON array.`);
  }
  return parsed;
}

/**
 * File beacon reads onto a stackfolio/eth-staking document: validator
 * upserts only when the record actually changed, balance points only when
 * the day is new or its value moved, withdrawals only for unseen refs.
 */
export const ethereumImportStakingToDocAction = createAction({
  requireAuth: false,
  requireReactor: "write",
  // Saved workflows refer to the action by name: don't rename it once published
  name: "import-staking-to-doc",
  displayName: "Import Staking Reads into Document",
  description:
    "Apply a fetch-validators run to a stackfolio/eth-staking document: validators are upserted only when their record changed, balance snapshots only when the day is new or its balance moved, withdrawals only for unseen references.",
  props: {
    stakingDocumentId: Property.ShortText({
      displayName: "Staking document id",
      required: true,
    }),
    validatorsJson: Property.LongText({
      displayName: "Validators (JSON)",
      description: "{{steps.validators.output.validators}}",
      required: true,
    }),
    balancesJson: Property.LongText({
      displayName: "Balance points (JSON)",
      description: "{{steps.validators.output.balances}}",
      required: true,
    }),
    withdrawalsJson: Property.LongText({
      displayName: "Withdrawals (JSON)",
      description:
        'Optional rows [{"withdrawalRef":…,"validatorIndex":…,"timestamp":"…","amountGwei":"…","blockNumber":…}]',
      required: false,
    }),
    ranAt: Property.ShortText({
      displayName: "Run timestamp (ISO)",
      required: true,
    }),
  },
  async run(context) {
    const p = context.propsValue;
    const incomingValidators = parseArray(p.validatorsJson, "validatorsJson") as IncomingValidator[];
    const incomingBalances = parseArray(p.balancesJson, "balancesJson") as Array<{
      validatorIndex: number;
      day: string;
      balanceGwei: string;
    }>;

    const doc = await context.reactor.get(p.stakingDocumentId);
    if (doc.header.documentType !== ETH_STAKING_TYPE) {
      throw new Error(
        `Document ${p.stakingDocumentId} is a ${doc.header.documentType}, not ${ETH_STAKING_TYPE}.`,
      );
    }
    const state = globalState<StakingGlobalState>(doc);
    const heldValidators = new Map(
      (state.validators ?? []).map((v) => [v.index, v]),
    );
    const heldBalances = new Map(
      (state.balanceHistory ?? []).map((p) => [
        `${p.validatorIndex}|${p.day}`,
        p.balanceGwei,
      ]),
    );
    const heldWithdrawals = new Set(
      (state.withdrawals ?? []).map((w) => w.withdrawalRef),
    );

    const actions = [];

    const changed = incomingValidators
      .filter((v) => typeof v.index === "number")
      .filter((v) => {
        const held = heldValidators.get(v.index);
        if (!held) return true;
        return (
          held.publicKey !== v.publicKey ||
          (held.withdrawalAddress ?? null) !== (v.withdrawalAddress ?? null) ||
          (held.activationTimestamp ?? null) !==
            epochSeconds(v.activationTimestamp) ||
          (held.withdrawableTimestamp ?? null) !==
            epochSeconds(v.withdrawableTimestamp) ||
          (held.exitedTimestamp ?? null) !== epochSeconds(v.exitedTimestamp)
        );
      })
      .map((v) => ({
        index: v.index,
        publicKey: v.publicKey,
        withdrawalAddress: v.withdrawalAddress ?? undefined,
        activationTimestamp: epochSeconds(v.activationTimestamp) ?? undefined,
        withdrawableTimestamp: epochSeconds(v.withdrawableTimestamp) ?? undefined,
        exitedTimestamp: epochSeconds(v.exitedTimestamp) ?? undefined,
      }));
    if (changed.length > 0) {
      actions.push(toGlobalAction("UPSERT_VALIDATORS", { validators: changed }));
    }

    const points = incomingBalances.filter((point) => {
      const key = `${point.validatorIndex}|${point.day}`;
      return heldBalances.get(key) !== point.balanceGwei;
    });
    if (points.length > 0) {
      actions.push(toGlobalAction("RECORD_BALANCES", { points, ranAt: p.ranAt }));
    }

    if (p.withdrawalsJson) {
      const withdrawals = (
        parseArray(p.withdrawalsJson, "withdrawalsJson") as Array<{
          withdrawalRef: number;
          validatorIndex: number;
          timestamp: string;
          amountGwei: string;
          blockNumber: number;
        }>
      )
        .filter((w) => !heldWithdrawals.has(w.withdrawalRef))
        .map((w) => ({
          id: `wd-${w.withdrawalRef}`,
          validatorIndex: w.validatorIndex,
          timestamp: w.timestamp,
          amountGwei: w.amountGwei,
          blockNumber: w.blockNumber,
          withdrawalRef: w.withdrawalRef,
        }));
      if (withdrawals.length > 0) {
        actions.push(toGlobalAction("RECORD_WITHDRAWALS", { withdrawals }));
      }
    }

    if (actions.length > 0) {
      await context.reactor.execute(p.stakingDocumentId, "main", actions);
    }
    return {
      validatorsUpserted: changed.length,
      balancesRecorded: points.length,
    };
  },
});
