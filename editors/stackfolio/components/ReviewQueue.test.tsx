// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import type { Queue, QueryState } from "../lib/graphql.js";
import { ReviewQueue, type QueueActions } from "./ReviewQueue.js";

const DISPERSE = "0xd152f549545093347a162dce210e7293f1452150";
const W = "0x1ad3d72e54fb0eb46e87f82f77b284fc8a66b16c";
const ok = (data: Queue): QueryState<Queue> => ({ data, error: null, loading: false, reload: () => {} });
const QUEUE: Queue = {
  total: 3,
  value: "120",
  groups: [
    {
      counterparty: DISPERSE,
      counterpartyLabel: null,
      direction: "IN",
      count: 1,
      value: "100",
      assets: ["a1"],
      suspectedAirdrop: true,
      events: [`${W}|e1|0`],
    },
    {
      counterparty: "uniswap-v2",
      counterpartyLabel: null,
      direction: "OUT",
      count: 2,
      value: "20",
      assets: ["a2"],
      suspectedAirdrop: false,
      events: [`${W}|e2|0`, `${W}|e3|1`],
    },
  ],
};

let host: HTMLElement;
let root: Root;
let actions: QueueActions;
const onChanged = vi.fn();
const onOpenEvents = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  actions = {
    ready: true,
    setEventCategories: vi.fn(),
    addCategoryRule: vi.fn(),
    setAssetIgnored: vi.fn(),
  };
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (queue = ok(QUEUE)) =>
  act(() =>
    root.render(
      <ReviewQueue
        queue={queue}
        symbolOf={(a) => a.toUpperCase()}
        actions={actions}
        onOpenEvents={onOpenEvents}
        onChanged={onChanged}
      />,
    ),
  );
const group = (id: string) => host.querySelector(`[data-group="${id}"]`) as HTMLElement;
const button = (scope: HTMLElement, text: string) =>
  [...scope.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text)) as HTMLButtonElement;

describe("ReviewQueue", () => {
  it("marks a suspected airdrop without choosing for the user, then makes the choice a rule", () => {
    render();
    const airdrop = group(`${DISPERSE}|IN`);
    expect(airdrop.textContent).toContain("suspected airdrop");
    const select = airdrop.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(button(airdrop, "Always for this address").disabled).toBe(true);
    act(() => {
      select.value = "AIRDROP_NON_TAXABLE";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => button(airdrop, "Always for this address").click());
    expect(actions.addCategoryRule).toHaveBeenCalledWith(
      expect.objectContaining({ counterparty: DISPERSE, direction: "IN", category: "AIRDROP_NON_TAXABLE" }),
    );
    expect(onChanged).toHaveBeenCalled();
    expect(host.textContent).toContain("Saved");
  });

  it("throws a suspected airdrop's tokens out as spam", () => {
    render();
    act(() => button(group(`${DISPERSE}|IN`), "Spam").click());
    expect(actions.setAssetIgnored).toHaveBeenCalledWith(["a1"], true);
  });

  it("offers only one-off choices for a protocol counterparty", () => {
    render();
    const swap = group("uniswap-v2|OUT");
    expect(button(swap, "Always for this address").disabled).toBe(true);
    const select = swap.querySelector("select") as HTMLSelectElement;
    act(() => {
      select.value = "TRADE";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => button(swap, "Only these 2").click());
    expect(actions.setEventCategories).toHaveBeenCalledWith({
      overrides: [
        { wallet: W, eventId: "e2", sequenceIndex: 0, category: "TRADE" },
        { wallet: W, eventId: "e3", sequenceIndex: 1, category: "TRADE" },
      ],
    });
    act(() => button(swap, "Show").click());
    expect(onOpenEvents).toHaveBeenCalledWith([`${W}|e2|0`, `${W}|e3|1`]);
  });

  it("says so when nothing waits", () => {
    render(ok({ total: 0, value: null, groups: [] }));
    expect(host.textContent).toContain("Every transaction has a type.");
  });
});
