import { describe, expect, it } from "vitest";
import { EtherscanError, type EtherscanRow } from "../etherscan.js";
import { fetchWithdrawals } from "./fetch-withdrawals.js";

const ADDR = "0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50";

/** Etherscan's txsBeaconWithdrawal row: gwei amounts, unix-second times. */
const row = (index: number, validator: number, gwei: string, block: number): EtherscanRow => ({
  withdrawalIndex: String(index),
  validatorIndex: String(validator),
  address: ADDR,
  amount: gwei,
  blockNumber: String(block),
  timestamp: "1681338455",
});

function client(rows: EtherscanRow[], fail?: EtherscanError) {
  const calls: Record<string, string | number>[] = [];
  return {
    calls,
    client: {
      async call(params: Record<string, string | number>): Promise<unknown> {
        calls.push(params);
        if (fail) throw fail;
        return params.action === "txsBeaconWithdrawal" ? rows : [];
      },
    },
  };
}

const state = {
  validators: [
    { index: 26871, publicKey: "0xb8ae", withdrawalAddress: ADDR },
    { index: 52483, publicKey: "0x8784", withdrawalAddress: ADDR.toUpperCase().replace("0X", "0x") },
  ],
  withdrawals: [{ withdrawalRef: 100, blockNumber: 17_000_000 }],
};

describe("fetchWithdrawals", () => {
  it("reads each withdrawal address once, from the last stored block on", async () => {
    const { client: c, calls } = client([]);
    await fetchWithdrawals(c, state);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ action: "txsBeaconWithdrawal", address: ADDR, startblock: 17_000_000 });
  });

  it("keeps new withdrawals of watched validators, in the staking document's shape", async () => {
    const { client: c } = client([
      row(100, 26871, "17312345", 17_000_000), // already stored
      row(101, 26871, "17312345", 17_034_870),
      row(102, 99999, "17000000", 17_034_871), // someone else's validator
      row(103, 52483, "32001234567", 17_100_000), // a full exit: principal
    ]);
    const out = await fetchWithdrawals(c, state);
    expect(out.withdrawals).toEqual([
      { withdrawalRef: 101, validatorIndex: 26871, amountGwei: "17312345", blockNumber: 17_034_870, timestamp: "2023-04-12T22:27:35.000Z" },
      { withdrawalRef: 103, validatorIndex: 52483, amountGwei: "32001234567", blockNumber: 17_100_000, timestamp: "2023-04-12T22:27:35.000Z" },
    ]);
    expect(out.error).toBeUndefined();
  });

  it("starts at the Shanghai fork when nothing is stored", async () => {
    const { client: c, calls } = client([]);
    await fetchWithdrawals(c, { validators: state.validators, withdrawals: [] });
    expect(calls[0]).toMatchObject({ startblock: 17_034_870 });
  });

  it("reports an Etherscan failure instead of throwing, so the schedule keeps its cadence", async () => {
    const { client: c } = client([], new EtherscanError("Etherscan answered HTTP 429; backing off.", "transient"));
    const out = await fetchWithdrawals(c, state);
    expect(out.withdrawals).toEqual([]);
    expect(out.error).toMatch(/429/);
  });

  it("skips malformed rows rather than recording junk", async () => {
    const { client: c } = client([{ ...row(104, 26871, "1", 17_200_000), amount: "-5" }, { withdrawalIndex: "x" }]);
    const out = await fetchWithdrawals(c, state);
    expect(out.withdrawals).toEqual([]);
  });
});
