import type { EthStakingValidatorsOperations } from "document-models/eth-staking/v1";
import { ValidatorConflictError } from "../../gen/validators/error.js";

export const ethStakingValidatorsOperations: EthStakingValidatorsOperations = {
  upsertValidatorsOperation(state, action) {
    const byIndex = new Map(
      state.validators.map((v) => [v.index, v.publicKey]),
    );
    for (const validator of action.input.validators) {
      const known = byIndex.get(validator.index);
      if (known !== undefined && known !== validator.publicKey) {
        throw new ValidatorConflictError(
          `Validator index ${validator.index} is already registered with a different public key`,
        );
      }
      byIndex.set(validator.index, validator.publicKey);
    }
    for (const validator of action.input.validators) {
      const existing = state.validators.find(
        (v) => v.index === validator.index,
      );
      if (existing) {
        existing.publicKey = validator.publicKey;
        existing.withdrawalAddress = validator.withdrawalAddress ?? null;
        existing.activationTimestamp = validator.activationTimestamp ?? null;
        existing.withdrawableTimestamp =
          validator.withdrawableTimestamp ?? null;
        existing.exitedTimestamp = validator.exitedTimestamp ?? null;
      } else {
        state.validators.push({
          index: validator.index,
          publicKey: validator.publicKey,
          withdrawalAddress: validator.withdrawalAddress ?? null,
          activationTimestamp: validator.activationTimestamp ?? null,
          withdrawableTimestamp: validator.withdrawableTimestamp ?? null,
          exitedTimestamp: validator.exitedTimestamp ?? null,
        });
      }
    }
  },
  removeValidatorsOperation(state, action) {
    const wanted = new Set(action.input.indices);
    state.validators = state.validators.filter((v) => !wanted.has(v.index));
    state.balanceHistory = state.balanceHistory.filter(
      (p) => !wanted.has(p.validatorIndex),
    );
    state.withdrawals = state.withdrawals.filter(
      (w) => !wanted.has(w.validatorIndex),
    );
  },
};
