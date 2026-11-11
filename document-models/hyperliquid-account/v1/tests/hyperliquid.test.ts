import { actions, reducer, utils } from "document-models/hyperliquid-account/v1";
import { describe, expect, it } from "vitest";

const { recordSnapshot, upsertAccount } = actions;

const ADDRESS = "0x8a88728340b81741c8ad70b07f601d99e9c3f7cb";

function documentWithAccount() {
  let document = utils.createDocument();
  document = reducer(document, upsertAccount({ address: ADDRESS }));
  return document;
}

describe("HyperliquidOperations", () => {
  describe("UPSERT_ACCOUNT", () => {
    it("adds a tracked account with empty snapshot fields", () => {
      const document = reducer(
        utils.createDocument(),
        upsertAccount({ address: ADDRESS, label: "fr4nk.eth" }),
      );
      expect(document.state.global.accounts).toEqual([
        {
          address: ADDRESS,
          label: "fr4nk.eth",
          accountValueUsd: null,
          spot: [],
          perps: [],
          fills: [],
          updatedAt: null,
        },
      ]);
    });

    it("normalises the address to lower case", () => {
      const document = reducer(
        utils.createDocument(),
        upsertAccount({ address: ADDRESS.toUpperCase() }),
      );
      expect(document.state.global.accounts[0].address).toBe(ADDRESS);
    });

    it("relabels an existing account without duplicating it", () => {
      let document = documentWithAccount();
      document = reducer(
        document,
        upsertAccount({ address: ADDRESS.toUpperCase(), label: "frankp.eth" }),
      );
      expect(document.state.global.accounts).toHaveLength(1);
      expect(document.state.global.accounts[0].label).toBe("frankp.eth");
    });

    it("keeps the old label when the input has none", () => {
      let document = reducer(
        utils.createDocument(),
        upsertAccount({ address: ADDRESS, label: "mine" }),
      );
      document = reducer(document, upsertAccount({ address: ADDRESS }));
      expect(document.state.global.accounts[0].label).toBe("mine");
    });

    it("rejects a malformed address", () => {
      const document = reducer(
        utils.createDocument(),
        upsertAccount({ address: "frankp.eth" }),
      );
      expect(document.state.global.accounts).toHaveLength(0);
      expect(document.operations.global[0].error).toBe(
        "address must be a 0x-prefixed 40-hex-character address",
      );
    });
  });

  describe("RECORD_SNAPSHOT", () => {
    const snapshot = {
      address: ADDRESS,
      accountValueUsd: "1234.56",
      spot: [{ tokenIndex: 0, coin: "USDC", total: "100.5", hold: "0" }],
      perps: [
        {
          coin: "HYPE",
          szi: "1.5",
          entryPx: "18.2",
          positionValue: "28.1",
          unrealizedPnl: "0.4",
        },
      ],
      fills: [
        { tid: 1, coin: "HYPE", side: "B", px: "18", sz: "1", time: 100 },
        {
          tid: 2,
          coin: "HYPE",
          side: "A",
          px: "19",
          sz: "1",
          time: 200,
          dir: "Close Long",
          fee: "0.01",
          closedPnl: "1",
        },
      ],
      updatedAt: "2026-11-11T10:00:00.000Z",
    };

    it("replaces the account snapshot wholesale", () => {
      let document = documentWithAccount();
      document = reducer(document, recordSnapshot(snapshot));
      const account = document.state.global.accounts[0];
      expect(account.accountValueUsd).toBe("1234.56");
      expect(account.spot).toEqual(snapshot.spot);
      expect(account.perps).toEqual(snapshot.perps);
      expect(account.updatedAt).toBe(snapshot.updatedAt);
      // Newest fill first.
      expect(account.fills.map((fill) => fill.tid)).toEqual([2, 1]);
      expect(account.fills[1]).toMatchObject({
        dir: null,
        fee: null,
        closedPnl: null,
      });

      document = reducer(
        document,
        recordSnapshot({
          ...snapshot,
          accountValueUsd: undefined,
          spot: [],
          perps: [],
          fills: [],
          updatedAt: "2026-11-11T11:00:00.000Z",
        }),
      );
      const cleared = document.state.global.accounts[0];
      expect(cleared.accountValueUsd).toBeNull();
      expect(cleared.spot).toEqual([]);
      expect(cleared.fills).toEqual([]);
      expect(cleared.updatedAt).toBe("2026-11-11T11:00:00.000Z");
    });

    it("orders fills by time then tid and keeps at most 500", () => {
      const fills = Array.from({ length: 600 }, (_, index) => ({
        tid: index,
        coin: "USDC",
        side: "B",
        px: "1",
        sz: "1",
        time: index % 2 === 0 ? 1 : 2,
      }));
      let document = documentWithAccount();
      document = reducer(document, recordSnapshot({ ...snapshot, fills }));
      const kept = document.state.global.accounts[0].fills;
      expect(kept).toHaveLength(500);
      // time-2 fills first, each group descending by tid.
      expect(kept[0]).toMatchObject({ time: 2, tid: 599 });
      // 300 time-2 fills (tid 599..1), then time-1 fills down to tid 200.
      expect(kept[499]).toMatchObject({ time: 1, tid: 200 });
    });

    it("rejects a snapshot for an untracked address", () => {
      const document = reducer(
        documentWithAccount(),
        recordSnapshot({
          ...snapshot,
          address: "0x0000000000000000000000000000000000000001",
        }),
      );
      expect(document.state.global.accounts[0].accountValueUsd).toBeNull();
      expect(document.operations.global[1].error).toBe(
        "no Hyperliquid account 0x0000000000000000000000000000000000000001",
      );
    });
  });
});
