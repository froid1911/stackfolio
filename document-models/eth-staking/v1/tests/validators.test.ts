import { actions, reducer, utils } from "document-models/eth-staking/v1";
import { describe, expect, it } from "vitest";

const { upsertValidators } = actions;

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
});
