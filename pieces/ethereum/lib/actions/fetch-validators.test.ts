import { beforeEach, describe, expect, it, vi } from "vitest";

import { ethereumFetchValidatorsAction } from "./fetch-validators.js";

const GENESIS_TIME = 1606824023;
const PUBKEY =
  "0x812b7b9df5afce79413640da569950f4f482ae4bb5032d0cab83ef37440f6f9e9c1c66cc93bb949de526470913011dbb";
const CRED_01 = `0x01${"00".repeat(11)}9e5b0f3c5b3e9f5f5e9d3e9f5e9d3e9f5e9d3e9f`;
const CRED_02 = `0x02${"00".repeat(11)}1234567890123456789012345678901234567890`;
const CRED_00 = `0x00${"00".repeat(11)}abcdefabcdefabcdefabcdefabcdefabcdefabcd`;

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const activeValidator = {
  index: "7",
  balance: "32512000000",
  validator: {
    pubkey: PUBKEY,
    withdrawal_credentials: CRED_01,
    effective_balance: "32000000000",
    slashed: false,
    activation_eligibility_epoch: "0",
    activation_epoch: "54",
    exit_epoch: "18446744073709551615",
    withdrawable_epoch: "18446744073709551615",
  },
};

const exitedValidator = {
  index: "9",
  balance: "31000000000",
  validator: {
    pubkey: `0x${"aa".repeat(48)}`,
    withdrawal_credentials: CRED_02,
    effective_balance: "31000000000",
    slashed: false,
    activation_eligibility_epoch: "0",
    activation_epoch: "10",
    exit_epoch: "1000",
    withdrawable_epoch: "1100",
  },
};

const legacyValidator = {
  index: "11",
  balance: "32000000000",
  validator: {
    pubkey: `0x${"bb".repeat(48)}`,
    withdrawal_credentials: CRED_00,
    effective_balance: "32000000000",
    slashed: false,
    activation_eligibility_epoch: "0",
    activation_epoch: "10",
    exit_epoch: "18446744073709551615",
    withdrawable_epoch: "18446744073709551615",
  },
};

const runAction = async (indices: number[], hour = "2026-11-11T10:00:00.000Z") =>
  (await ethereumFetchValidatorsAction.run({
    propsValue: { indicesJson: JSON.stringify(indices), hour },
    auth: { props: { rpcUrl: "http://127.0.0.1:8545", beaconUrl: "http://127.0.0.1:5052" } },
  } as unknown as Parameters<
    typeof ethereumFetchValidatorsAction.run
  >[0])) as {
    validators: Array<{
      index: number;
      publicKey: string;
      withdrawalAddress: string | null;
      activationTimestamp: string | null;
      withdrawableTimestamp: string | null;
      exitedTimestamp: string | null;
    }>;
    balances: Array<{
      validatorIndex: number;
      day: string;
      balanceGwei: number;
    }>;
    error: string | null;
  };

const json = (body: unknown) => ({ ok: true, status: 200, json: () => body });

beforeEach(() => {
  fetchMock.mockReset();
});

describe("fetch-validators", () => {
  it("reads validators and head balances", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/eth/v1/beacon/genesis")) {
        return json({ data: { genesis_time: String(GENESIS_TIME) } });
      }
      if (url.endsWith("/validators/7")) return json({ data: activeValidator });
      if (url.endsWith("/validators/9")) return json({ data: exitedValidator });
      if (url.endsWith("/validators/11")) return json({ data: legacyValidator });
      throw new Error(`unexpected url ${url}`);
    });

    const result = await runAction([7, 9, 11]);

    expect(result.error).toBeNull();
    expect(result.validators[0]).toEqual({
      index: 7,
      publicKey: PUBKEY,
      withdrawalAddress: `0x${CRED_01.slice(-40)}`,
      activationTimestamp: null,
      withdrawableTimestamp: null,
      exitedTimestamp: null,
    });
    const exited = result.validators[1];
    expect(exited.withdrawalAddress).toBe(`0x${CRED_02.slice(-40)}`);
    expect(exited.exitedTimestamp).toBe(
      new Date((GENESIS_TIME + 1100 * 32 * 12) * 1000).toISOString(),
    );
    expect(result.validators[2].withdrawalAddress).toBeNull();

    expect(result.balances).toEqual([
      { validatorIndex: 7, day: "2026-11-11", balanceGwei: 32512000000 },
      { validatorIndex: 9, day: "2026-11-11", balanceGwei: 31000000000 },
      { validatorIndex: 11, day: "2026-11-11", balanceGwei: 32000000000 },
    ]);
  });

  it("uses a client-provided activation timestamp when present", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/eth/v1/beacon/genesis")) {
        return json({ data: { genesis_time: String(GENESIS_TIME) } });
      }
      return json({
        data: {
          ...activeValidator,
          validator: {
            ...activeValidator.validator,
            activation_timestamp: "1607000000",
          },
        },
      });
    });

    const result = await runAction([7]);
    expect(result.validators[0].activationTimestamp).toBe(
      new Date(1607000000 * 1000).toISOString(),
    );
  });

  it("reports an unreachable beacon as an error, never throws", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5052"));

    const result = await runAction([7]);

    expect(result.validators).toEqual([]);
    expect(result.balances).toEqual([]);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("keeps partial results and names the failing index", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/eth/v1/beacon/genesis")) {
        return json({ data: { genesis_time: String(GENESIS_TIME) } });
      }
      if (url.endsWith("/validators/7")) return json({ data: activeValidator });
      return { ok: false, status: 404, json: () => ({ message: "not found" }) };
    });

    const result = await runAction([7, 40]);

    expect(result.validators).toHaveLength(1);
    expect(result.balances).toHaveLength(1);
    expect(result.error).toContain("40");
  });

  it("resolves validators by withdrawal address via the list endpoint", async () => {
    fetchMock.mockImplementation(
      (url: string, init?: { method?: string; body?: string }) => {
      if (url.endsWith("/eth/v1/beacon/genesis")) {
        return json({ data: { genesis_time: String(GENESIS_TIME) } });
      }
      if (url.endsWith("/validators") && init?.method === "POST") {
        expect(JSON.parse(init.body ?? "[]")).toEqual({
          addresses: [`0x${CRED_01.slice(-40)}`],
        });
        return json({ data: [activeValidator] });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const result = (await ethereumFetchValidatorsAction.run({
      propsValue: {
        indicesJson: null,
        withdrawalAddressesJson: [`0x${CRED_01.slice(-40)}`],
        hour: "2026-11-11T10:00:00.000Z",
      },
      auth: {
        props: {
          rpcUrl: "http://127.0.0.1:8545",
          beaconUrl: "http://127.0.0.1:5052",
        },
      },
    } as unknown as Parameters<
      typeof ethereumFetchValidatorsAction.run
    >[0])) as {
      validators: Array<{ index: number }>;
      balances: Array<Record<string, unknown>>;
      error: string | null;
    };

    expect(result.error).toBeNull();
    expect(result.validators[0]?.index).toBe(7);
    expect(result.balances).toEqual([
      { validatorIndex: 7, day: "2026-11-11", balanceGwei: 32512000000 },
    ]);
  });

  it("rejects malformed index lists", async () => {
    await expect(
      ethereumFetchValidatorsAction.run({
        propsValue: { indicesJson: "1,2", hour: "2026-11-11T10:00:00.000Z" },
        auth: { props: {} },
      } as unknown as Parameters<
        typeof ethereumFetchValidatorsAction.run
      >[0]),
    ).rejects.toThrow(/indicesJson/);
  });
});
