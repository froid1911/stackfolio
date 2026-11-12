// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, paletteKeyHandler } from "./CommandPalette.js";

// React 19 gates act() on this flag; without it every act() no-ops and
// renders leak outside the act queue (the "not configured to support
// act" warning above is exactly that).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The palette's data hooks hit the GraphQL layer; stub the module's hooks
// so the keyboard and list behavior is what's under test.
vi.mock("../lib/graphql.js", () => ({
  useAddressLabels: () => ({
    data: [{ documentId: "d", address: "0xff", label: "hot", ensName: "frankp.eth" }],
    error: null,
    loading: false,
    reload: () => {},
  }),
  useAssets: () => ({
    data: [{ documentId: "d", identifier: "eip155:1/slip44:60", symbol: "ETH", name: "Ether", decimals: 18, kind: "NATIVE", chainId: 1, coingeckoId: null, custom: false }],
    error: null,
    loading: false,
    reload: () => {},
  }),
  useEventsPage: () => ({
    data: { rows: [], total: 0 },
    error: null,
    loading: false,
    reload: () => {},
  }),
}));

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

function render(props: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const onGo = vi.fn();
  const onClose = vi.fn();
  const base = { open: true, onClose, driveId: "drive", onGo, ...props };
  act(() => root.render(<CommandPalette {...base} />));
  return { ...base, onGo, onClose };
}

const type = (value: string) => {
  const input = document.querySelector<HTMLInputElement>("input[role=combobox]")!;
  act(() => {
    // React tracks the DOM value; set through the native setter so the
    // change event is seen as new, then dispatch the input event React
    // listens to.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const key = (target: Element, init: KeyboardEventInit) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
};

const options = (): Array<{ selected: boolean; text: string }> =>
  [...host.querySelectorAll<HTMLElement>("[role=option]")].map((li) => ({
    selected: li.getAttribute("aria-selected") === "true",
    text: li.textContent ?? "",
  }));

describe("CommandPalette", () => {
  it("renders nav pages on open (empty query)", () => {
    render();
    const list = options();
    expect(list.length).toBeGreaterThan(5);
    expect(list[0].text).toContain("Dashboard");
  });

  it("filters by text and shows typed matches", () => {
    render();
    type("eth");
    const list = options();
    expect(list.some((o) => o.text.includes("Ether"))).toBe(true);
    expect(list.some((o) => o.text.includes("Dashboard"))).toBe(false);
  });

  it("ArrowDown moves the active option and wraps", () => {
    render();
    key(document.querySelector("input")!, { key: "ArrowDown" });
    const after = options();
    expect(after[1].selected).toBe(true);
    expect(after[0].selected).toBe(false);
  });

  it("Enter invokes the active hit and closes", () => {
    const { onGo, onClose } = render();
    key(document.querySelector("input")!, { key: "ArrowDown" });
    key(document.querySelector("input")!, { key: "Enter" });
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(onGo.mock.calls[0][0]).toMatchObject({ kind: "page", to: { page: "balances" } });
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes", () => {
    const { onClose } = render();
    key(document.querySelector("input")!, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("option click navigates", () => {
    const { onGo } = render();
    const staking = [...host.querySelectorAll<HTMLElement>("[role=option]")].find((li) =>
      li.textContent?.includes("Staking"),
    )!;
    act(() => staking.click());
    expect(onGo).toHaveBeenCalledWith(
      expect.objectContaining({ to: { page: "staking" } }),
    );
  });

  it("an account hit navigates with the account kind and slugged address", () => {
    const { onGo } = render();
    type("frankp");
    const hit = [...host.querySelectorAll<HTMLElement>("[role=option]")].find((li) =>
      li.textContent?.includes("frankp.eth"),
    )!;
    act(() => hit.click());
    expect(onGo).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "account",
        label: "frankp.eth",
        to: { page: "balances", detail: "0xff" },
      }),
    );
  });

  it("open=false renders nothing", () => {
    render({ open: false });
    expect(host.querySelector("input")).toBeNull();
  });
});

describe("paletteKeyHandler", () => {
  it("Ctrl+K opens, Ctrl+K again closes, Escape closes", () => {
    let open = false;
    const onOpen = vi.fn(() => {
      open = true;
    });
    const onClose = vi.fn(() => {
      open = false;
    });
    const fire = (init: KeyboardEventInit) => {
      paletteKeyHandler(open, onOpen, onClose)(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
      );
    };
    fire({ key: "k", ctrlKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
    fire({ key: "k", ctrlKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
    onOpen.mockClear();
    onClose.mockClear();
    open = true;
    fire({ key: "k", metaKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("plain k does nothing", () => {
    const onOpen = vi.fn();
    paletteKeyHandler(false, onOpen, vi.fn())(
      new KeyboardEvent("keydown", { key: "k" }),
    );
    expect(onOpen).not.toHaveBeenCalled();
  });
});
