import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumImportStakingToDocAction } from "./import-staking-to-doc.js";

const get = vi.fn();
const execute = vi.fn();

const ACTIVE = {
  index: 7,
  publicKey: "0xpub7",
  withdrawalAddress: "0xwd",
  activationTimestamp: null,
  withdrawableTimestamp: null,
  exitedTimestamp: null,
};

const stakingDoc = (over: Record<string, unknown> = {}) => ({
  header: { documentId: "s1", documentType: "stackfolio/eth-staking" },
  state: {
    global: { validators: [ACTIVE], balanceHistory: [], withdrawals: [], ...over },
  },
});

const run = (props: Record<string, unknown>) =>
  ethereumImportStakingToDocAction.run({
    propsValue: { ranAt: "2026-11-11T10:00:00.000Z", ...props },
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<
    typeof ethereumImportStakingToDocAction.run
  >[0]);

beforeEach(() => {
  get.mockReset();
  execute.mockReset();
  execute.mockResolvedValue({});
});

describe("import-staking-to-doc", () => {
  it("upserts changed validators, new days and unseen withdrawals", async () => {
    get.mockResolvedValue(
      stakingDoc({ balanceHistory: [{ validatorIndex: 7, day: "2026-11-10", balanceGwei: "32000000000" }] }),
    );

    const result = (await run({
      stakingDocumentId: "s1",
      validatorsJson: JSON.stringify([
        ACTIVE, // unchanged
        {
          index: 9,
          publicKey: "0xpub9",
          withdrawalAddress: null,
          activationTimestamp: "2026-01-01T00:00:00.000Z",
          withdrawableTimestamp: "2026-02-01T00:00:00.000Z",
          exitedTimestamp: "2026-02-01T00:00:00.000Z",
        },
      ]),
      balancesJson: JSON.stringify([
        { validatorIndex: 7, day: "2026-11-10", balanceGwei: "32000000000" }, // unchanged
        { validatorIndex: 7, day: "2026-11-11", balanceGwei: "32001000000" }, // new day
      ]),
      withdrawalsJson: JSON.stringify([
        {
          withdrawalRef: 1234,
          validatorIndex: 9,
          timestamp: "2026-02-01T00:00:00.000Z",
          amountGwei: "1000",
          blockNumber: 21000,
        },
      ]),
    })) as { validatorsUpserted: number; balancesRecorded: number };

    expect(result).toEqual({ validatorsUpserted: 1, balancesRecorded: 1 });
    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: Record<string, unknown> }>,
    ];
    expect(actions.map((a) => a.type)).toEqual([
      "UPSERT_VALIDATORS",
      "RECORD_BALANCES",
      "RECORD_WITHDRAWALS",
    ]);
    const upsert = actions[0].input as {
      validators: Array<{ index: number; activationTimestamp: number }>;
    };
    expect(upsert.validators[0].activationTimestamp).toBe(1767225600);
    const points = actions[1].input as { points: Array<{ day: string }> };
    expect(points.points).toEqual([
      { validatorIndex: 7, day: "2026-11-11", balanceGwei: "32001000000" },
    ]);
    const wds = actions[2].input as { withdrawals: Array<{ id: string }> };
    expect(wds.withdrawals[0].id).toBe("wd-1234");
  });

  it("dispatches nothing when nothing changed", async () => {
    get.mockResolvedValue(
      stakingDoc({
        balanceHistory: [{ validatorIndex: 7, day: "2026-11-11", balanceGwei: "32000000000" }],
      }),
    );

    const result = (await run({
      stakingDocumentId: "s1",
      validatorsJson: JSON.stringify([ACTIVE]),
      balancesJson: JSON.stringify([
        { validatorIndex: 7, day: "2026-11-11", balanceGwei: "32000000000" },
      ]),
    })) as { validatorsUpserted: number; balancesRecorded: number };

    expect(result).toEqual({ validatorsUpserted: 0, balancesRecorded: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("records a changed balance for a day already held", async () => {
    get.mockResolvedValue(
      stakingDoc({
        balanceHistory: [{ validatorIndex: 7, day: "2026-11-11", balanceGwei: "32000000000" }],
      }),
    );

    await run({
      stakingDocumentId: "s1",
      validatorsJson: JSON.stringify([]),
      balancesJson: JSON.stringify([
        { validatorIndex: 7, day: "2026-11-11", balanceGwei: "32001000000" },
      ]),
    });

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string }>,
    ];
    expect(actions.map((a) => a.type)).toEqual(["RECORD_BALANCES"]);
  });

  it("stringifies numeric balances before recording", async () => {
    get.mockResolvedValue(stakingDoc());

    await run({
      stakingDocumentId: "s1",
      validatorsJson: JSON.stringify([]),
      // fetch-validators hands over gwei as numbers; the document type is
      // a string and its reducer would reject anything else.
      balancesJson: JSON.stringify([
        { validatorIndex: 7, day: "2026-11-11", balanceGwei: 32000000000 },
      ]),
    });

    const [, , actions] = execute.mock.calls[0] as [
      string,
      string,
      Array<{ type: string; input: { points: Array<{ balanceGwei: unknown }> } }>,
    ];
    expect(actions[0].input.points[0].balanceGwei).toBe("32000000000");
  });
});
