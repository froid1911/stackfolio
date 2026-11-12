import { generateMock } from "document-model/mock";
import {
  actions,
  isEthStakingDocument,
  recordBalances,
  recordWithdrawals,
  reducer,
  removeValidators,
  RemoveValidatorsInputSchema,
  upsertValidators,
  utils,
} from "document-models/eth-staking/v1";
import { describe, expect, it } from "vitest";


const validator = (overrides: Record<string, unknown> = {}) => ({
  index: 100,
  publicKey: "0x8991",
  withdrawalAddress: "0xfrank",
  activationTimestamp: 1600000000,
  withdrawableTimestamp: null,
  exitedTimestamp: null,
  ...overrides,
});

describe("ValidatorsOperations", () => {
  it("should handle upsertValidators operation", () => {
    const document = reducer(
      utils.createDocument(),
      upsertValidators({ validators: [validator()] }),
    );

    expect(document.operations.global[0].error).toBeUndefined();
    expect(document.state.global.validators).toEqual([
      {
        index: 100,
        publicKey: "0x8991",
        withdrawalAddress: "0xfrank",
        activationTimestamp: 1600000000,
        withdrawableTimestamp: null,
        exitedTimestamp: null,
      },
    ]);
  });

  it("should update an existing validator in place", () => {
    let document = reducer(
      utils.createDocument(),
      upsertValidators({
        validators: [validator({ withdrawableTimestamp: null })],
      }),
    );
    document = reducer(
      document,
      upsertValidators({
        validators: [validator({ withdrawableTimestamp: 1700000000 })],
      }),
    );

    expect(document.state.global.validators).toHaveLength(1);
    expect(document.state.global.validators[0].withdrawableTimestamp).toBe(
      1700000000,
    );
  });

  it("should reject an index registered with a different public key", () => {
    let document = reducer(
      utils.createDocument(),
      upsertValidators({ validators: [validator()] }),
    );
    document = reducer(
      document,
      upsertValidators({ validators: [validator({ publicKey: "0x9000" })] }),
    );

    expect(document.operations.global[1].error).toBe(
      "Validator index 100 is already registered with a different public key",
    );
    expect(document.state.global.validators[0].publicKey).toBe("0x8991");
  });

  it("should reject a conflicting pair inside one batch", () => {
    const document = reducer(
      utils.createDocument(),
      upsertValidators({
        validators: [validator(), validator({ publicKey: "0x9000" })],
      }),
    );

    expect(document.operations.global[0].error).toBe(
      "Validator index 100 is already registered with a different public key",
    );
    expect(document.state.global.validators).toHaveLength(0);
  });

  it("should store every optional field when given", () => {
    const document = reducer(
      utils.createDocument(),
      upsertValidators({
        validators: [
          {
            index: 100,
            publicKey: "0x8991",
            withdrawalAddress: null,
            activationTimestamp: null,
            withdrawableTimestamp: null,
            exitedTimestamp: null,
          },
          {
            index: 101,
            publicKey: "0x9000",
            withdrawalAddress: "0xfrank",
            activationTimestamp: 1600000000,
            withdrawableTimestamp: 1700000000,
            exitedTimestamp: 1700000500,
          },
        ],
      }),
    );

    const bare = document.state.global.validators[0];
    expect(bare.withdrawalAddress).toBeNull();
    expect(bare.activationTimestamp).toBeNull();
    const full = document.state.global.validators[1];
    expect(full.withdrawableTimestamp).toBe(1700000000);
    expect(full.exitedTimestamp).toBe(1700000500);
  });

  it("should record an exit through an update", () => {
    let document = reducer(
      utils.createDocument(),
      upsertValidators({ validators: [validator()] }),
    );
    document = reducer(
      document,
      upsertValidators({
        validators: [validator({ exitedTimestamp: 1700000500 })],
      }),
    );

    expect(document.state.global.validators[0].exitedTimestamp).toBe(
      1700000500,
    );
  });

  it("should clear optional fields that an update omits", () => {
    let document = reducer(
      utils.createDocument(),
      upsertValidators({ validators: [validator()] }),
    );
    document = reducer(
      document,
      upsertValidators({
        validators: [
          {
            index: 100,
            publicKey: "0x8991",
            withdrawalAddress: null,
            activationTimestamp: null,
            withdrawableTimestamp: 1700000000,
            exitedTimestamp: null,
          },
        ],
      }),
    );

    const stored = document.state.global.validators[0];
    expect(stored.withdrawalAddress).toBeNull();
    expect(stored.activationTimestamp).toBeNull();
    expect(stored.withdrawableTimestamp).toBe(1700000000);
  });

  it("should handle removeValidators operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RemoveValidatorsInputSchema());

    const updatedDocument = reducer(document, removeValidators(input));

    expect(isEthStakingDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    // A rejected operation records its error; give it the state it needs.
    expect(updatedDocument.operations.global[0].error).toBeUndefined();
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_VALIDATORS",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("fills a watched placeholder key but refuses a real re-registration", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      upsertValidators({
        validators: [
          {
            index: 42,
            publicKey: "",
            withdrawalAddress: null,
            activationTimestamp: null,
            withdrawableTimestamp: null,
            exitedTimestamp: null,
          },
        ],
      }),
    );
    // The beacon resolves the watched index; the empty key must accept it.
    document = reducer(
      document,
      upsertValidators({
        validators: [validator({ index: 42, publicKey: "0xbeef" })],
      }),
    );
    expect(document.state.global.validators[0].publicKey).toBe("0xbeef");
    // A second, different real key for the same index stays a conflict.
    const rejected = reducer(
      document,
      upsertValidators({
        validators: [validator({ index: 42, publicKey: "0xd00d" })],
      }),
    );
    expect(
      rejected.operations.global[rejected.operations.global.length - 1].error,
    ).toBeDefined();
  });

  it("removes the validator with its balances and withdrawals, keeping the rest", () => {
    let document = utils.createDocument();
    document = reducer(
      document,
      upsertValidators({
        validators: [
          {
            index: 7,
            publicKey: "0xaaaa",
            withdrawalAddress: null,
            activationTimestamp: null,
            withdrawableTimestamp: null,
            exitedTimestamp: null,
          },
          {
            index: 9,
            publicKey: "0xbbbb",
            withdrawalAddress: null,
            activationTimestamp: null,
            withdrawableTimestamp: null,
            exitedTimestamp: null,
          },
        ],
      }),
    );
    document = reducer(
      document,
      recordBalances({
        points: [
          { validatorIndex: 7, day: "2026-11-11", balanceGwei: "32000000000" },
          { validatorIndex: 9, day: "2026-11-11", balanceGwei: "31000000000" },
        ],
        ranAt: "2026-11-11T10:00:00.000Z",
      }),
    );
    document = reducer(
      document,
      recordWithdrawals({
        withdrawals: [
          {
            id: "00000000-0000-4000-8000-000000000007",
            validatorIndex: 7,
            timestamp: "2026-11-10T00:00:00.000Z",
            amountGwei: "1000000000",
            blockNumber: 20000000,
            withdrawalRef: 7000,
          },
        ],
      }),
    );

    document = reducer(document, removeValidators({ indices: [7] }));

    const state = document.state.global;
    expect(state.validators.map((v) => v.index)).toEqual([9]);
    expect(
      state.balanceHistory.every((p) => p.validatorIndex === 9),
    ).toBe(true);
    expect(state.withdrawals).toHaveLength(0);
  });
});
