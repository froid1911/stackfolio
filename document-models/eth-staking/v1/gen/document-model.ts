import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "stackfolio/eth-staking",
  name: "ETH Staking",
  author: {
    name: "Stackfolio",
    website: "https://github.com/froid1911/stackfolio",
  },
  extension: ".staking",
  description:
    "Observed Ethereum beacon-chain validators: set, daily balances and withdrawals from the local beacon node.",
  specifications: [
    {
      state: {
        local: {
          schema: "",
          examples: [],
          initialValue: "",
        },
        global: {
          schema:
            "type EthStakingState {\n  validators: [Validator!]!\n  balanceHistory: [BalancePoint!]!\n  withdrawals: [Withdrawal!]!\n  cursor: StakeCursor\n}\n\ntype Validator {\n  index: Int!\n  publicKey: String!\n  withdrawalAddress: String\n  activationTimestamp: Int\n  withdrawableTimestamp: Int\n  exitedTimestamp: Int\n}\n\ntype BalancePoint {\n  validatorIndex: Int!\n  day: String!\n  balanceGwei: String!\n}\n\ntype Withdrawal {\n  id: OID!\n  validatorIndex: Int!\n  timestamp: DateTime!\n  amountGwei: String!\n  blockNumber: Int!\n  withdrawalRef: Int!\n}\n\ntype StakeCursor {\n  lastBalanceDay: DateTime\n  lastWithdrawalBlock: Int\n}",
          examples: [],
          initialValue:
            '{"validators": [], "balanceHistory": [], "withdrawals": [], "cursor": null}',
        },
      },
      modules: [
        {
          id: "2b58272a-f524-4bbc-a0b7-01311b977285",
          name: "validators",
          description: "The tracked validator set",
          operations: [
            {
              id: "85e3d805-ccf6-4106-952d-34b7e6bf0b3d",
              name: "UPSERT_VALIDATORS",
              description: "",
              schema:
                "input UpsertValidatorsInput {\n  validators: [ValidatorInput!]!\n}\n\ninput ValidatorInput {\n  index: Int!\n  publicKey: String!\n  withdrawalAddress: String\n  activationTimestamp: Int\n  withdrawableTimestamp: Int\n  exitedTimestamp: Int\n}",
              template: "",
              reducer:
                "const byIndex = new Map(state.validators.map((v) => [v.index, v.publicKey]));\nfor (const validator of action.input.validators) {\n  const known = byIndex.get(validator.index);\n  if (known !== undefined && known !== validator.publicKey) {\n    throw new ValidatorConflictError(\n      `Validator index ${validator.index} is already registered with a different public key`,\n    );\n  }\n  byIndex.set(validator.index, validator.publicKey);\n}\nfor (const validator of action.input.validators) {\n  const existing = state.validators.find((v) => v.index === validator.index);\n  if (existing) {\n    existing.publicKey = validator.publicKey;\n    existing.withdrawalAddress = validator.withdrawalAddress ?? null;\n    existing.activationTimestamp = validator.activationTimestamp ?? null;\n    existing.withdrawableTimestamp = validator.withdrawableTimestamp ?? null;\n    existing.exitedTimestamp = validator.exitedTimestamp ?? null;\n  } else {\n    state.validators.push({\n      index: validator.index,\n      publicKey: validator.publicKey,\n      withdrawalAddress: validator.withdrawalAddress ?? null,\n      activationTimestamp: validator.activationTimestamp ?? null,\n      withdrawableTimestamp: validator.withdrawableTimestamp ?? null,\n      exitedTimestamp: validator.exitedTimestamp ?? null,\n    });\n  }\n}",
              errors: [
                {
                  id: "dd8d29fe-f599-408d-a982-70814b85152d",
                  name: "ValidatorConflictError",
                  code: "VALIDATOR_CONFLICT",
                  description:
                    "A validator index is registered with a different public key",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "fefe64ae-aa77-47f5-8b4c-04931cd41c86",
          name: "history",
          description: "Daily balances, withdrawals and scan progress",
          operations: [
            {
              id: "e5054cea-0dab-4b7e-aacf-0e0b62cc0c81",
              name: "RECORD_BALANCES",
              description: "",
              schema:
                "input RecordBalancesInput {\n  points: [BalancePointInput!]!\n  ranAt: DateTime!\n}\n\ninput BalancePointInput {\n  validatorIndex: Int!\n  day: String!\n  balanceGwei: String!\n}",
              template: "",
              reducer:
                "for (const point of action.input.points) {\n  const existing = state.balanceHistory.find(\n    (p) => p.validatorIndex === point.validatorIndex && p.day === point.day,\n  );\n  if (existing) {\n    existing.balanceGwei = point.balanceGwei;\n  } else {\n    state.balanceHistory.push({\n      validatorIndex: point.validatorIndex,\n      day: point.day,\n      balanceGwei: point.balanceGwei,\n    });\n  }\n}",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "93e394b3-649e-4d5b-ba17-b49c7d6152ba",
              name: "RECORD_WITHDRAWALS",
              description: "",
              schema:
                "input RecordWithdrawalsInput {\n  withdrawals: [WithdrawalInput!]!\n}\n\ninput WithdrawalInput {\n  id: OID!\n  validatorIndex: Int!\n  timestamp: DateTime!\n  amountGwei: String!\n  blockNumber: Int!\n  withdrawalRef: Int!\n}",
              template: "",
              reducer:
                "const isDecimal = (value: string) => /^(0|[1-9][0-9]*)(\\.[0-9]+)?$/.test(value);\nfor (const withdrawal of action.input.withdrawals) {\n  if (!isDecimal(withdrawal.amountGwei)) {\n    throw new InvalidAmountError(`${withdrawal.amountGwei} is not a decimal amount`);\n  }\n}\nconst known = new Set(state.withdrawals.map((w) => w.withdrawalRef));\nfor (const withdrawal of action.input.withdrawals) {\n  if (known.has(withdrawal.withdrawalRef)) continue;\n  known.add(withdrawal.withdrawalRef);\n  state.withdrawals.push({\n    id: withdrawal.id,\n    validatorIndex: withdrawal.validatorIndex,\n    timestamp: withdrawal.timestamp,\n    amountGwei: withdrawal.amountGwei,\n    blockNumber: withdrawal.blockNumber,\n    withdrawalRef: withdrawal.withdrawalRef,\n  });\n}",
              errors: [
                {
                  id: "45873a5e-633d-4041-b66e-53c7cdea1070",
                  name: "InvalidAmountError",
                  code: "INVALID_AMOUNT",
                  description: "A withdrawal amount is not a decimal",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "b5f0d160-3cd7-4a17-afe7-0846dba68f90",
              name: "RECORD_STAKE_SCAN_PROGRESS",
              description: "",
              schema:
                "input RecordStakeScanProgressInput {\n  lastBalanceDay: DateTime\n  lastWithdrawalBlock: Int\n}",
              template: "",
              reducer:
                "const cursor = state.cursor ?? { lastBalanceDay: null, lastWithdrawalBlock: null };\nif (\n  action.input.lastBalanceDay != null &&\n  cursor.lastBalanceDay != null &&\n  action.input.lastBalanceDay < cursor.lastBalanceDay\n) {\n  throw new CursorRegressionError(\n    `lastBalanceDay would regress from ${cursor.lastBalanceDay} to ${action.input.lastBalanceDay}`,\n  );\n}\nif (\n  action.input.lastWithdrawalBlock != null &&\n  cursor.lastWithdrawalBlock != null &&\n  action.input.lastWithdrawalBlock < cursor.lastWithdrawalBlock\n) {\n  throw new CursorRegressionError(\n    `lastWithdrawalBlock would regress from ${cursor.lastWithdrawalBlock} to ${action.input.lastWithdrawalBlock}`,\n  );\n}\nif (action.input.lastBalanceDay != null) cursor.lastBalanceDay = action.input.lastBalanceDay;\nif (action.input.lastWithdrawalBlock != null) cursor.lastWithdrawalBlock = action.input.lastWithdrawalBlock;\nstate.cursor = cursor;",
              errors: [
                {
                  id: "6c60bf94-5617-4a78-aeae-e045881f0c95",
                  name: "CursorRegressionError",
                  code: "CURSOR_REGRESSION",
                  description: "A stake cursor must never move backwards",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
      version: 1,
      changeLog: [],
    },
  ],
};
