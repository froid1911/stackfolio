import { describe, expect, it } from "vitest";
import { slug } from "./slugs.js";
import { buildHits, type SearchData } from "./search.js";
import { NAV_ENTRIES, type Page } from "../nav.js";

const NAV_ONLY = NAV_ENTRIES.map((e) => e.page);

const DATA: SearchData = {
  accounts: [
    { address: "0xfrank", ensName: "frankp.eth", label: "hot wallet" },
    { address: "0xdead", ensName: null, label: "cold" },
  ],
  assets: [
    { identifier: "eip155:1/erc20:0xdai", symbol: "DAI", name: "Dai Stablecoin" },
    { identifier: "eip155:1/slip44:60", symbol: "ETH", name: "Ether" },
  ],
  events: [
    {
      eventId: "ev-1",
      eventIdentifier: "0xabc123_0",
      timestamp: "2026-11-01T10:00:00Z",
      type: "SWAP",
      asset: "eip155:1/erc20:0xdai",
      amount: "100",
    },
  ],
};

describe("buildHits", () => {
  it("an empty query lists the nav pages in table order", () => {
    const hits = buildHits("", DATA);
    expect(hits.map((h) => h.to.page)).toEqual(NAV_ONLY);
    expect(hits.every((h) => h.kind === "page")).toBe(true);
  });

  it("whitespace-only query behaves as empty", () => {
    expect(buildHits("   ", DATA).every((h) => h.kind === "page")).toBe(true);
  });

  it("matches nav pages case-insensitively on the label", () => {
    const hits = buildHits("hIsToRy", DATA);
    expect(hits).toEqual([
      { kind: "page", label: "History", to: { page: "history" } },
    ]);
  });

  it("an account hit slugs its address into detail", () => {
    const hits = buildHits("frank", DATA);
    expect(hits).toEqual([
      {
        kind: "account",
        label: "frankp.eth",
        sub: "hot wallet",
        to: { page: "balances", detail: "0xfrank" },
      },
    ]);
  });

  it("an account matches its label too; ens label wins", () => {
    const hits = buildHits("cold", DATA);
    expect(hits[0]).toMatchObject({ kind: "account", label: "cold" });
  });

  it("assets match symbol or name, hit carries the identifier as detail", () => {
    const hits = buildHits("stable", DATA);
    expect(hits).toEqual([
      {
        kind: "asset",
        label: "Dai Stablecoin",
        sub: "DAI",
        to: { page: "assets", detail: slug("eip155:1/erc20:0xdai") },
      },
    ]);
    const eth = buildHits("ether", DATA);
    expect(eth.find((h) => h.kind === "asset")?.label).toBe("Ether");
  });

  it("events match identifier, asset or type; detail is the event id slug", () => {
    const hits = buildHits("abc123", DATA);
    expect(hits).toEqual([
      {
        kind: "event",
        label: "0xabc123_0",
        sub: "SWAP",
        to: { page: "history", detail: slug("ev-1") },
      },
    ]);
    expect(buildHits("swap", DATA).some((h) => h.kind === "event")).toBe(true);
  });

  it("label starts-with ranks above a mid-string substring", () => {
    const data: SearchData = {
      accounts: [],
      assets: [
        // name carries the match position for "dai": the symbol hits
        // mid-string first here, so XDAI's mid-name is the fair case.
        { identifier: "a2", symbol: "XDAI", name: "dai extra" },
        { identifier: "a1", symbol: "DAI", name: "extra dai" },
      ],
      events: [],
    };
    const hits = buildHits("dai", data).filter((h) => h.kind === "asset");
    expect(hits.map((h) => h.label)).toEqual(["dai extra", "extra dai"]);
  });

  it("caps 8 per kind and keeps other kinds", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      eventId: `ev-${i}`,
      eventIdentifier: `tx-match-${i}`,
      timestamp: "2026-11-01T10:00:00Z",
      type: "TEST",
      asset: "ETH",
      amount: "1",
    }));
    const hits = buildHits("match", { accounts: [], assets: [], events: many });
    expect(hits.filter((h) => h.kind === "event")).toHaveLength(8);
  });

  it("empty data yields only matching nav pages, never throws", () => {
    const hits = buildHits("frank", { accounts: [], assets: [], events: [] });
    expect(hits).toEqual([]);
  });

  it("page hits keep section order", () => {
    const hits = buildHits("a", DATA)
      .filter((h) => h.kind === "page")
      .map((h) => h.to.page as Page);
    // "a" matches every label except History and P&L; rank ties (none
    // start with "a") and the table order decides.
    expect(hits).toEqual([
      "dashboard",
      "balances",
      "address-book",
      "assets",
      "prices",
      "defi",
    ]);
  });
});
