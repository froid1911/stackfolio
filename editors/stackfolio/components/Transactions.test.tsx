// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import type { EventsPage, Issue, QueryState } from "../lib/graphql.js";
import { Transactions, eventsCsv } from "./Transactions.js";

const ok = <T,>(data: T): QueryState<T> => ({
  data,
  error: null,
  loading: false,
  reload: () => {},
});

const EVENT = {
  documentId: "doc-1",
  eventId: "ev-1",
  eventIdentifier: "0xabc_0",
  sequenceIndex: 0,
  timestamp: "2026-11-01T10:00:00Z",
  type: "SPEND",
  subtype: "NONE",
  asset: "eip155:1/erc20:0xdai",
  amount: "100000000000000000000",
  counterparty: "0xfeed",
  counterpartyLabel: null,
  notes: "=SUM(A1)",
  ignored: false,
  source: "CHAIN",
  address: "0xfrank",
  chainId: 1,
  label: null,
  price: null as string | null,
  priceUnit: null as string | null,
  priceSource: null as string | null,
  priceGap: "value" as "value" | "basis" | null,
};

const ASSETS = ok([
  {
    documentId: "reg",
    identifier: "eip155:1/erc20:0xdai",
    symbol: "DAI",
    name: "Dai",
    decimals: 18,
    kind: "TOKEN",
    chainId: 1,
    coingeckoId: null,
    custom: false,
  },
]);

const ISSUES = ok<Issue[]>([
  {
    documentId: "doc-1",
    seq: 1,
    code: "MISSING_PRICE",
    severity: "WARNING",
    message: "no price for MYST",
    accountId: "0xfrank",
    at: "2026-11-02T00:00:00Z",
  },
]);

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(props: Partial<Parameters<typeof Transactions>[0]> = {}) {
  const base = {
    accounts: ok([]),
    assets: ASSETS,
    filter: { ignored: false, first: 50 },
    setFilter: () => {},
    page: ok<EventsPage>({ rows: [EVENT], total: 1 }),
    ...props,
  };
  act(() => root.render(<Transactions {...base} />));
  return base;
}

const buttons = (text: string) =>
  [...host.querySelectorAll("button")].filter((b) => b.textContent?.includes(text));

describe("Transactions history page", () => {
  it("shows the events table by default", () => {
    render();
    // The page renders what the table shows, not the raw identifiers:
    // formatted amount, short counterparty/account, lowercased kind tag.
    const body = host.querySelector("tbody")?.textContent ?? "";
    expect(body).toContain("spend");
    expect(body).toContain("−100 DAI");
    expect(body).toContain("0xfeed");
    expect(body).toContain("0xfrank");
  });

  it("marks direction and the books' price per row", () => {
    const manual = { ...EVENT, eventId: "ev-2", sequenceIndex: 0, price: "0.95", priceUnit: "EUR", priceSource: "MANUAL" };
    const setFilter = vi.fn();
    render({ page: ok<EventsPage>({ rows: [EVENT, manual], total: 2 }), needsPriceCount: 330, setFilter });
    const [unpriced, priced] = [...host.querySelectorAll("tbody tr")].map((r) => r.textContent ?? "");
    expect(unpriced).toContain("OUT");
    expect(unpriced).toContain("needs a price");
    expect(priced).toContain("0.95");
    expect(priced).toContain("manual");

    const toggle = [...host.querySelectorAll("label")].find((l) => l.textContent?.includes("needs a price (330)"));
    act(() => toggle?.querySelector("input")?.click());
    expect(setFilter).toHaveBeenCalledWith(expect.objectContaining({ needsPrice: true, offset: 0 }));
  });

  it("sub-tab click reports the intent", () => {
    const onSub = vi.fn();
    render({ sub: "events", issues: ISSUES, onSub });
    act(() => buttons("Issues")[0].click());
    expect(onSub).toHaveBeenCalledWith("issues");
  });

  it("issues sub-tab lists the issue with severity and message", () => {
    render({ sub: "issues", issues: ISSUES, onSub: () => {} });
    expect(host.querySelector("tbody")?.textContent).toContain("MISSING_PRICE");
    expect(host.querySelector("tbody")?.textContent).toContain("no price for MYST");
    expect(host.querySelector("tbody")?.textContent).toContain("warning");
  });

  it("an issue's account link filters events to it and returns to the list", () => {
    const setFilter = vi.fn();
    const onSub = vi.fn();
    render({ sub: "issues", issues: ISSUES, setFilter, onSub });
    const link = host.querySelector<HTMLButtonElement>("tbody button")!;
    act(() => link.click());
    expect(setFilter).toHaveBeenCalledWith(
      expect.objectContaining({ address: "0xfrank", ids: undefined, offset: 0 }),
    );
    expect(onSub).toHaveBeenCalledWith("events");
  });

  it("Export CSV downloads the CURRENT filtered rows through toCsv", () => {
    // jsdom lacks Blob URLs; stub the browser surface the button uses.
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: create, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revoke, configurable: true });
    const clicks: string[] = [];
    const realCreate = document.createElement.bind(document);
    const createElement = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement;
      if (tag === "a") el.click = () => clicks.push(el.download);
      return el;
    });

    render();
    act(() => buttons("Export CSV")[0].click());

    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatch(/^stackfolio-events-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(create).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:x");
    createElement.mockRestore();
  });

  it("row click reports the event id", () => {
    const onOpenEvent = vi.fn();
    render({ onOpenEvent });
    const row = host.querySelector<HTMLTableRowElement>("tbody tr")!;
    act(() => row.click());
    expect(onOpenEvent).toHaveBeenCalledWith("ev-1");
  });

  it("account cell click reports the address and does not open the event", () => {
    const onOpenEvent = vi.fn();
    const onOpenAccount = vi.fn();
    render({ onOpenEvent, onOpenAccount });
    const cell = host.querySelector<HTMLButtonElement>("tbody tr button")!;
    act(() => cell.click());
    expect(onOpenAccount).toHaveBeenCalledWith("0xfrank");
    expect(onOpenEvent).not.toHaveBeenCalled();
  });

  it("Review-Focus: a formula-like note renders as inert text, not executed markup", () => {
    render();
    const cell = [...host.querySelectorAll("td")].find((td) => td.textContent === "=SUM(A1)");
    expect(cell).toBeDefined();
    // React escapes; nothing parsed as markup:
    expect(host.innerHTML).toContain("=SUM(A1)");
    expect(host.querySelector("td script")).toBeNull();
  });

  it("eventsCsv quotes per RFC and guards the formula note", () => {
    const csv = eventsCsv([EVENT], (a) => (a.includes("dai") ? "DAI" : a));
    expect(csv).toContain("timestamp,type,subtype,asset,amount,counterparty,account,notes\r\n");
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain("100000000000000000000");
  });
});
