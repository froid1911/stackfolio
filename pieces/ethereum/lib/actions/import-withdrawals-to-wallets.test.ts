import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ethereumImportWithdrawalsToWalletsAction,
  withdrawalEvents,
} from "./import-withdrawals-to-wallets.js";

const get = vi.fn();
const execute = vi.fn();

const WD = "0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50";
const OTHER = "0x1111111111111111111111111111111111111111";

const staking = {
  validators: [
    { index: 7, withdrawalAddress: WD.toUpperCase().replace("0X", "0x") },
    { index: 9, withdrawalAddress: OTHER },
  ],
  withdrawals: [
    { withdrawalRef: 20, validatorIndex: 7, timestamp: "2026-11-10T00:00:00.000Z", amountGwei: "12000000" },
    { withdrawalRef: 10, validatorIndex: 7, timestamp: "2023-04-15T00:00:00.000Z", amountGwei: "4274859380" },
    { withdrawalRef: 30, validatorIndex: 9, timestamp: "2026-11-10T00:00:00.000Z", amountGwei: "1" },
    { withdrawalRef: 40, validatorIndex: 7, timestamp: "2026-11-11T00:00:00.000Z", amountGwei: "bad" },
  ],
};

const wallet = (over: Record<string, unknown> = {}) => ({
  address: WD,
  chainId: 1,
  ignored: false,
  ledger: [{ eventIdentifier: "withdrawal-20", sequenceIndex: 0 }],
  ...over,
});

describe("withdrawalEvents", () => {
  it("files the wallet's validators' unseen withdrawals as the scan would", () => {
    expect(withdrawalEvents(staking, wallet())).toEqual([
      {
        id: "withdrawal-10-0",
        eventIdentifier: "withdrawal-10",
        sequenceIndex: 0,
        timestamp: "2023-04-15T00:00:00.000Z",
        type: "STAKING",
        subtype: "WITHDRAWAL",
        asset: "eip155:1/slip44:60",
        amount: "4274859380000000000",
        counterparty: WD,
        notes: null,
      },
    ]);
  });

  it("files nothing for other chains, ignored wallets or wallets no validator pays", () => {
    expect(withdrawalEvents(staking, wallet({ chainId: 8453 }))).toEqual([]);
    expect(withdrawalEvents(staking, wallet({ ignored: true }))).toEqual([]);
    expect(withdrawalEvents(staking, wallet({ address: "0xdead" }))).toEqual([]);
    expect(withdrawalEvents(staking, wallet({ address: undefined }))).toEqual([]);
    expect(withdrawalEvents({}, wallet())).toEqual([]);
  });

  it("reads a wallet without a ledger as holding nothing", () => {
    expect(withdrawalEvents(staking, wallet({ ledger: undefined })).map((e) => e.id)).toEqual([
      "withdrawal-10-0",
      "withdrawal-20-0",
    ]);
  });
});

const run = (props: Record<string, unknown>) =>
  ethereumImportWithdrawalsToWalletsAction.run({
    propsValue: { importedAt: "2026-11-14T10:00:00.000Z", stakingDocumentId: "s1", ...props },
    auth: undefined,
    reactor: { get, execute },
  } as unknown as Parameters<typeof ethereumImportWithdrawalsToWalletsAction.run>[0]);

const docs: Record<string, unknown> = {
  s1: { header: { documentType: "stackfolio/eth-staking" }, state: { global: staking } },
  w1: { header: { documentType: "stackfolio/wallet-account" }, state: { global: wallet() } },
  w2: { header: { documentType: "stackfolio/wallet-account" }, state: { global: wallet({ chainId: 10 }) } },
};

beforeEach(() => {
  get.mockReset();
  execute.mockReset();
  get.mockImplementation((id: string) => Promise.resolve(docs[id]));
  execute.mockResolvedValue({});
});

describe("import-withdrawals-to-wallets", () => {
  it("imports into each wallet only what it lacks", async () => {
    const result = await run({ walletDocumentIdsJson: JSON.stringify(["w1", "w2", 5]) });

    expect(result).toEqual({ imported: { w1: 1 } });
    expect(execute).toHaveBeenCalledTimes(1);
    const [id, branch, actions] = execute.mock.calls[0] as [string, string, { type: string; input: { batchId: string; events: unknown[] } }[]];
    expect([id, branch]).toEqual(["w1", "main"]);
    expect(actions[0].type).toBe("IMPORT_EVENTS");
    expect(actions[0].input.batchId).toBe("withdrawals-2026-11-14T10:00:00.000Z");
    expect(actions[0].input.events).toHaveLength(1);
  });

  it("refuses a document that is not a staking document", async () => {
    await expect(
      run({ stakingDocumentId: "w1", walletDocumentIdsJson: "[]" }),
    ).rejects.toThrow("not stackfolio/eth-staking");
  });

  it("refuses wallet ids that are not a list", async () => {
    await expect(run({ walletDocumentIdsJson: '{"a":1}' })).rejects.toThrow("JSON array");
  });
});
