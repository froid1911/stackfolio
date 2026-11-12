// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressBookView } from "./AddressBookView.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ENTRIES = [
  {
    id: "a1",
    address: "0xfrank",
    chainId: 1,
    label: "hot",
    ensName: "frankp.eth",
    ignored: false,
    addedAt: "2026-11-01T00:00:00.000Z",
  },
  {
    id: "a2",
    address: "0xcold",
    chainId: 1,
    label: "cold",
    ensName: null,
    ignored: true,
    addedAt: "2026-11-02T00:00:00.000Z",
  },
];

const actions = {
  ready: true,
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  removeAddress: vi.fn(),
  setAddressIgnored: vi.fn(),
};
vi.mock("../lib/mutations.js", () => ({ usePortfolioActions: () => actions }));

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  for (const fn of Object.values(actions)) if (vi.isMockFunction(fn)) fn.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(props: Partial<Parameters<typeof AddressBookView>[0]> = {}) {
  const base = {
    entries: ENTRIES,
    loading: false,
    portfolioReady: true,
    onAdd: actions.addAddress,
    onUpdate: actions.updateAddress,
    onRemove: actions.removeAddress,
    onIgnore: actions.setAddressIgnored,
    ...props,
  };
  act(() => root.render(<AddressBookView {...base} />));
  return base;
}

const buttonIn = (row: Element, text: string) =>
  [...row.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(text),
  );

describe("AddressBookView", () => {
  it("lists entries with address, label, ens, chain and ignored badge", () => {
    render();
    const body = host.querySelector("tbody")?.textContent ?? "";
    expect(body).toContain("0xfrank");
    expect(body).toContain("frankp.eth");
    expect(body).toContain("0xcold");
    expect(body).toContain("ignored");
    expect(body).not.toContain("0xfrank · ignored");
  });

  it("add form dispatches addAddress once with the built input", () => {
    render();
    const fill = (placeholder: string, value: string) => {
      const input = [...host.querySelectorAll<HTMLInputElement>("input")].find((i) =>
        i.placeholder?.includes(placeholder),
      )!;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    fill("address", "0xNew");
    fill("label", "  new label  ");
    const form = host.querySelector("form")!;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(actions.addAddress).toHaveBeenCalledTimes(1);
    const [draft] = actions.addAddress.mock.calls[0];
    // The view hands the raw draft; addressInput() (mutations.ts) is
    // what lowercases/trims - tested in mutations.test.ts.
    expect(draft.address).toBe("0xNew");
    expect(draft.label).toBe("  new label  ");
    expect(draft.chainId).toBe(1);
    expect(draft.id).toBeTruthy();
    expect(Date.parse(draft.timestamp)).not.toBeNaN();
  });

  it("inline label edit dispatches updateAddress with id and new label", () => {
    render();
    const row = [...host.querySelectorAll("tbody tr")].find((r) =>
      r.textContent?.includes("0xfrank"),
    )!;
    const edit = buttonIn(row, "rename") ?? buttonIn(row, "✎");
    expect(edit).toBeTruthy();
    act(() => edit!.click());
    const input = row.querySelector<HTMLInputElement>("input")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "renamed");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const save = buttonIn(row, "save") ?? buttonIn(row, "✓");
    act(() => save!.click());
    expect(actions.updateAddress).toHaveBeenCalledWith({ id: "a1", label: "renamed" });
  });

  it("ignore toggle dispatches the flipped flag", () => {
    render();
    const row = [...host.querySelectorAll("tbody tr")].find((r) =>
      r.textContent?.includes("0xfrank"),
    )!;
    const ignore = buttonIn(row, "ignore") ?? buttonIn(row, "Ignore");
    act(() => ignore!.click());
    expect(actions.setAddressIgnored).toHaveBeenCalledWith("a1", true);
  });

  it("delete asks inline confirm BEFORE dispatching removeAddress", () => {
    render();
    const row = [...host.querySelectorAll("tbody tr")].find((r) =>
      r.textContent?.includes("0xfrank"),
    )!;
    const remove = buttonIn(row, "remove") ?? buttonIn(row, "Remove");
    act(() => remove!.click());
    expect(actions.removeAddress).not.toHaveBeenCalled();
    const confirm = buttonIn(row, "confirm") ?? buttonIn(row, "yes");
    expect(confirm).toBeTruthy();
    act(() => confirm!.click());
    expect(actions.removeAddress).toHaveBeenCalledWith("a1");
  });

  it("a deep-linked address absent from the book shows a prefill row", () => {
    render({ deepLink: { address: "0xgone", resolved: false } });
    expect(host.textContent).toContain("0xgone");
    expect(host.textContent).toContain("not in this portfolio");
    const input = [...host.querySelectorAll<HTMLInputElement>("input")].find((i) =>
      i.placeholder?.includes("address"),
    )!;
    expect(input.value).toBe("0xgone");
  });

  it("a deep-linked address present just highlights it, no prefill row", () => {
    render({ deepLink: { address: "0xfrank", resolved: true } });
    expect(host.textContent).not.toContain("not in this portfolio");
    const row = [...host.querySelectorAll("tbody tr")].find((r) =>
      r.textContent?.includes("0xfrank"),
    )!;
    expect(row.className).toContain("ring");
  });
});
