// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import type { EventRow } from "../lib/graphql.js";
import { CategoryReview, type CategoryActions } from "./CategoryReview.js";

const EVENT = {
  documentId: "doc-1",
  eventId: "ev-1",
  eventIdentifier: "0xabc",
  sequenceIndex: 2,
  timestamp: "2026-11-01T10:00:00Z",
  type: "RECEIVE",
  subtype: "NONE",
  asset: "eip155:1/slip44:60",
  amount: "1000000000000000000",
  counterparty: "0xfeed",
  counterpartyLabel: null,
  notes: null,
  ignored: false,
  source: "CHAIN",
  address: "0xABCD",
  chainId: 1,
  label: null,
  price: null,
  priceUnit: null,
  priceSource: null,
  priceGap: null,
  category: "UNCLASSIFIED",
  categorySource: "unclassified",
} as EventRow;

let host: HTMLElement;
let root: Root;
let actions: CategoryActions;
const onChanged = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  actions = { ready: true, setEventCategories: vi.fn(), clearEventCategories: vi.fn() };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (event: EventRow) =>
  act(() => root.render(<CategoryReview event={event} actions={actions} currency="EUR" onChanged={onChanged} />));
const change = (el: HTMLInputElement | HTMLSelectElement, value: string) =>
  act(() => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === text) as HTMLButtonElement;

describe("CategoryReview", () => {
  it("sets a received gift with the giver's cost and date", () => {
    render(EVENT);
    expect(host.textContent).toContain("Unclassified · needs a type");
    change(host.querySelector("select") as HTMLSelectElement, "GIFT_IN");
    const [cost, date] = [...host.querySelectorAll("input")];
    change(cost, "1250.5");
    change(date, "2023-04-01");
    act(() => button("Set category").click());
    expect(actions.setEventCategories).toHaveBeenCalledWith({
      overrides: [
        {
          wallet: "0xabcd",
          eventId: "ev-1",
          sequenceIndex: 2,
          category: "GIFT_IN",
          giftCost: "1250.5",
          giftAcquiredAt: "2023-04-01T00:00:00.000Z",
        },
      ],
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("refuses a gift cost that is not a number", () => {
    render(EVENT);
    change(host.querySelector("select") as HTMLSelectElement, "GIFT_IN");
    change(host.querySelectorAll("input")[0], "1.250,50");
    act(() => button("Set category").click());
    expect(actions.setEventCategories).not.toHaveBeenCalled();
    expect(host.textContent).toContain("plain number");
  });

  it("resets a hand-picked category", () => {
    render({ ...EVENT, category: "LOST", categorySource: "override" });
    expect((host.querySelector("select") as HTMLSelectElement).value).toBe("LOST");
    act(() => button("Reset to automatic").click());
    expect(actions.clearEventCategories).toHaveBeenCalledWith({
      events: [{ wallet: "0xabcd", eventId: "ev-1", sequenceIndex: 2 }],
    });
  });
});
