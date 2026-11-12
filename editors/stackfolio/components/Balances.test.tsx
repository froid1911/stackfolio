// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import type { QueryState } from "../lib/graphql.js";
import { Balances } from "./Balances.js";

const ok = <T,>(data: T): QueryState<T> => ({
  data,
  error: null,
  loading: false,
  reload: () => {},
});

const DATA = {
  holdings: [
    { asset: "ETH", symbol: "ETH", wallet: "0xw1", quantity: "2", value: "4000" },
    { asset: "ETH", symbol: "ETH", wallet: "0xw2", quantity: "1", value: "2000" },
    { asset: "DAI", symbol: "DAI", wallet: "0xw1", quantity: "0.1", value: "0.1" },
    { asset: "DAI", symbol: "DAI", wallet: "0xw2", quantity: "0.2", value: "0.2" },
    { asset: "MYS", symbol: "MYS", wallet: "0xw1", quantity: "7", value: null },
  ],
  perAsset: [
    { asset: "DAI", symbol: "DAI", quantity: "0.3", value: "0.3" },
    { asset: "ETH", symbol: "ETH", quantity: "3", value: "6000" },
    { asset: "MYS", symbol: "MYS", quantity: "7", value: null },
  ],
  perAccount: [
    { wallet: "0xw1", ensName: "fr4nk.eth", label: null, value: "4000.1" },
    { wallet: "0xw2", ensName: null, label: "cold", value: "2000.2" },
  ],
  total: "6000.3",
};

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

function render(
  holdings: QueryState<typeof DATA | null> = ok(DATA),
  props: Partial<Parameters<typeof Balances>[0]> = {},
) {
  act(() =>
    root.render(
      <Balances
        holdings={holdings}
        onOpenAsset={vi.fn()}
        onOpenAccount={vi.fn()}
        {...props}
      />,
    ),
  );
}

describe("Balances view", () => {
  it("totals row carries the grand total and per-asset rows render", () => {
    render();
    const cells = [...host.querySelectorAll("tfoot td")].map((td) => td.textContent);
    expect(cells).toEqual(["Total", "", "6,000.3", "100%"]);
    const body = host.querySelector("tbody")?.textContent ?? "";
    expect(body).toContain("ETH");
    expect(body).toContain("DAI");
  });

  it("decimal-exact per-asset sum renders (0.1 + 0.2 = 0.3, no float tail)", () => {
    render();
    const daiRow = [...host.querySelectorAll("tbody tr")].find((r) =>
      r.textContent?.includes("DAI"),
    );
    expect(daiRow?.textContent).toContain("0.3");
    expect(daiRow?.textContent).not.toContain("0.30000000000000004");
  });

  it("unpriced asset shows an em dash value and is excluded from the donut", () => {
    render();
    const mysRow = [...host.querySelectorAll("tbody tr")].find((r) =>
      r.textContent?.includes("MYS"),
    );
    expect(mysRow?.textContent).toContain("—");
    const donutLegend = host.querySelector("ul")?.textContent ?? "";
    expect(donutLegend).not.toContain("MYS");
    expect(donutLegend).toContain("ETH");
  });

  it("no holdings → empty state copy", () => {
    render(ok({ holdings: [], perAsset: [], perAccount: [], total: "0" }));
    expect(host.textContent).toContain("Nothing held yet");
  });

  it("asset click reports the asset identifier", () => {
    const onOpenAsset = vi.fn();
    render(ok(DATA), { onOpenAsset });
    const btn = [...host.querySelectorAll<HTMLButtonElement>("tbody button")].find((b) =>
      b.textContent?.includes("ETH"),
    )!;
    act(() => btn.click());
    expect(onOpenAsset).toHaveBeenCalledWith("ETH");
  });

  it("expanding an asset reveals its wallet rows and account click reports", () => {
    const onOpenAccount = vi.fn();
    render(ok(DATA), { onOpenAccount });
    const ethRow = [...host.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((r) =>
      r.textContent?.includes("ETH"),
    )!;
    act(() => ethRow.click());
    const accounts = host.querySelector("tbody")?.textContent ?? "";
    expect(accounts).toContain("fr4nk.eth");
    expect(accounts).toContain("cold");
    const w1 = [...host.querySelectorAll<HTMLButtonElement>("tbody tr button")].find((b) =>
      b.textContent?.includes("fr4nk.eth"),
    )!;
    act(() => w1.click());
    // A wallet row of an asset opens the ASSET's detail (Task 11's
    // overlay lists holdings per wallet itself); account drill goes
    // through the account lists beside the donut.
    expect(onOpenAccount).not.toHaveBeenCalled();
  });

  it("account list under the donut reports the wallet address", () => {
    const onOpenAccount = vi.fn();
    render(ok(DATA), { onOpenAccount });
    const w2 = [...host.querySelectorAll<HTMLButtonElement>("ul button")].find((b) =>
      b.textContent?.includes("cold"),
    )!;
    act(() => w2.click());
    expect(onOpenAccount).toHaveBeenCalledWith("0xw2");
  });

  it("expanding an asset closes the open account overlay", () => {
    const onCloseAccount = vi.fn();
    render(ok(DATA), { onCloseAccount });
    const ethRow = [...host.querySelectorAll<HTMLTableRowElement>("tbody tr")].find((r) =>
      r.textContent?.includes("ETH"),
    )!;
    act(() => ethRow.click());
    expect(onCloseAccount).toHaveBeenCalledTimes(1);
  });

  it("query error surfaces the message", () => {
    render({ data: null, error: "switchboard down", loading: false, reload: () => {} });
    expect(host.textContent).toContain("switchboard down");
  });
});
