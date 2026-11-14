import {
  addCategoryRule,
  clearEventCategories,
  reducer,
  removeCategoryRule,
  setAssetTrusted,
  setEventCategories,
  updateCategoryRule,
  utils,
} from "document-models/portfolio/v1";
import { describe, expect, it } from "vitest";

const BINANCE = "0x28C6c06298d514Db089934071355E5743bf21d60";
const W = "0x5c647ca5e2bc5bd17c40410fcb8003d38879ae50";
type Doc = ReturnType<typeof utils.createDocument>;
const lastError = (doc: Doc) => doc.operations.global.at(-1)?.error;
const withRule = () =>
  reducer(
    utils.createDocument(),
    addCategoryRule({
      id: "r1",
      counterparty: BINANCE,
      direction: "OUT",
      category: "WITHDRAWAL",
      label: " Binance ",
    }),
  );

describe("CategoriesOperations", () => {
  it("adds a rule with a lower-cased counterparty and trimmed label", () => {
    const doc = withRule();
    expect(lastError(doc)).toBeUndefined();
    expect(doc.state.global.categoryRules).toEqual([
      {
        id: "r1",
        counterparty: BINANCE.toLowerCase(),
        chainId: null,
        direction: "OUT",
        asset: null,
        category: "WITHDRAWAL",
        label: "Binance",
      },
    ]);
  });

  it("refuses a rule for something that is not an address", () => {
    const doc = reducer(
      utils.createDocument(),
      addCategoryRule({
        id: "r1",
        counterparty: "binance",
        direction: "ANY",
        category: "DEPOSIT",
      }),
    );
    expect(lastError(doc)).toBe("binance is not an address");
  });

  it("updates and removes rules, refusing unknown ids", () => {
    let doc = reducer(
      withRule(),
      updateCategoryRule({ id: "r1", category: "GIFT_OUT", label: "" }),
    );
    expect(doc.state.global.categoryRules[0]).toMatchObject({
      category: "GIFT_OUT",
      label: null,
      direction: "OUT",
    });
    doc = reducer(doc, updateCategoryRule({ id: "r1", direction: "ANY" }));
    expect(doc.state.global.categoryRules[0]).toMatchObject({
      category: "GIFT_OUT",
      direction: "ANY",
    });
    doc = reducer(doc, updateCategoryRule({ id: "nope", category: "TRADE" }));
    expect(lastError(doc)).toBe("Rule nope does not exist");
    doc = reducer(doc, removeCategoryRule({ id: "r1" }));
    expect(doc.state.global.categoryRules).toEqual([]);
    doc = reducer(doc, removeCategoryRule({ id: "r1" }));
    expect(lastError(doc)).toBe("Rule r1 does not exist");
  });

  it("upserts overrides per wallet, event and sequence, and clears them", () => {
    let doc = reducer(
      utils.createDocument(),
      setEventCategories({
        overrides: [
          {
            wallet: W.toUpperCase().replace("0X", "0x"),
            eventId: "e1",
            sequenceIndex: 0,
            category: "GIFT_OUT",
          },
        ],
      }),
    );
    doc = reducer(
      doc,
      setEventCategories({
        overrides: [
          {
            wallet: W,
            eventId: "e1",
            sequenceIndex: 0,
            category: "GIFT_IN",
            giftCost: "1234.5",
            giftAcquiredAt: "2023-01-01T00:00:00.000Z",
          },
          { wallet: W, eventId: "e2", sequenceIndex: 1, category: "LOST" },
        ],
      }),
    );
    expect(doc.state.global.categoryOverrides).toEqual([
      {
        wallet: W,
        eventId: "e1",
        sequenceIndex: 0,
        category: "GIFT_IN",
        giftCost: "1234.5",
        giftAcquiredAt: "2023-01-01T00:00:00.000Z",
      },
      {
        wallet: W,
        eventId: "e2",
        sequenceIndex: 1,
        category: "LOST",
        giftCost: null,
        giftAcquiredAt: null,
      },
    ]);
    doc = reducer(
      doc,
      clearEventCategories({
        events: [{ wallet: W, eventId: "e1", sequenceIndex: 0 }],
      }),
    );
    expect(doc.state.global.categoryOverrides.map((o) => o.eventId)).toEqual([
      "e2",
    ]);
  });

  it("refuses gift fields off a GIFT_IN override and a cost that is not a decimal", () => {
    const off = reducer(
      utils.createDocument(),
      setEventCategories({
        overrides: [
          {
            wallet: W,
            eventId: "e",
            sequenceIndex: 0,
            category: "TRADE",
            giftCost: "1",
          },
        ],
      }),
    );
    expect(lastError(off)).toBe(
      "Gift cost and date belong on a GIFT_IN override only",
    );
    const bad = reducer(
      utils.createDocument(),
      setEventCategories({
        overrides: [
          {
            wallet: W,
            eventId: "e",
            sequenceIndex: 0,
            category: "GIFT_IN",
            giftCost: "-1",
          },
        ],
      }),
    );
    expect(lastError(bad)).toBe("Gift cost -1 is not a decimal");
  });

  it("reads a document from before categories as having none", () => {
    const old = utils.createDocument();
    delete (old.state.global as { categoryRules?: unknown }).categoryRules;
    delete (old.state.global as { categoryOverrides?: unknown })
      .categoryOverrides;
    const doc = reducer(
      old,
      addCategoryRule({
        id: "r1",
        counterparty: BINANCE,
        direction: "ANY",
        category: "DEPOSIT",
      }),
    );
    expect(lastError(doc)).toBeUndefined();
    expect(doc.state.global.categoryOverrides).toEqual([]);
  });

  it("trusts and untrusts an asset once, old documents included", () => {
    const old = utils.createDocument();
    delete (old.state.global as { trustedAssets?: unknown }).trustedAssets;
    const asset = "eip155:137/erc20:0x9e2d266d6c90f6c0d80a88159b15958f7135b8af";
    let doc = reducer(old, setAssetTrusted({ asset, trusted: true }));
    doc = reducer(doc, setAssetTrusted({ asset, trusted: true }));
    expect(lastError(doc)).toBeUndefined();
    expect(doc.state.global.trustedAssets).toEqual([asset]);
    doc = reducer(doc, setAssetTrusted({ asset, trusted: false }));
    expect(doc.state.global.trustedAssets).toEqual([]);
  });
});
