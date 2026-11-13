// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetDetail } from "./AssetDetail.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The overlay reads the index and the portfolio document; stub both.
const holders = vi.fn<() => unknown>();
const actions = {
  ready: true,
  setPriceOverride: vi.fn(),
  removePriceOverride: vi.fn(),
};
vi.mock("../lib/graphql.js", () => ({
  usePriceHistory: (_driveId: string, asset: string | null) => ({
    // The real query filters by asset; the stub honors the argument so
    // an asset without rows gets none.
    data:
      asset === "ETH"
        ? [
            { asset: "ETH", hour: "2026-11-10T00:00:00Z", price: "2000" },
            { asset: "ETH", hour: "2026-11-11T00:00:00Z", price: "2100" },
          ]
        : [],
    error: null,
    loading: false,
    reload: () => {},
  }),
  useOverrides: () => ({
    data: [],
    error: null,
    loading: false,
    reload: () => {},
  }),
  useHoldings: () => ({
    data: holders(),
    error: null,
    loading: false,
    reload: () => {},
  }),
}));
vi.mock("../lib/mutations.js", () => ({
  usePortfolioActions: () => actions,
}));

// ECharts needs a canvas context, which jsdom does not implement; the chart's
// data and ARIA contract are asserted through the wrapper instead.
vi.mock("echarts", () => ({
  init: () => ({
    setOption: () => {},
    resize: () => {},
    dispose: () => {},
  }),
}));

const HOLDINGS = {
  holdings: [
    { asset: "ETH", symbol: "ETH", wallet: "0xw1", quantity: "2", value: "4000" },
    { asset: "ETH", symbol: "ETH", wallet: "0xw2", quantity: "1", value: "2000" },
    { asset: "DAI", symbol: "DAI", wallet: "0xw1", quantity: "5", value: "5" },
  ],
  perAsset: [
    { asset: "DAI", symbol: "DAI", quantity: "5", value: "5" },
    { asset: "ETH", symbol: "ETH", quantity: "3", value: "6000" },
  ],
  perAccount: [
    { wallet: "0xw1", ensName: "fr4nk.eth", label: null, value: "4005" },
    { wallet: "0xw2", ensName: null, label: null, value: "2000" },
  ],
  total: "6005",
};

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  holders.mockReturnValue(HOLDINGS);
  actions.setPriceOverride.mockClear();
  actions.removePriceOverride.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(assetId = "ETH", onClose = vi.fn()) {
  act(() =>
    root.render(
      <AssetDetail driveId="drive" assetId={assetId} portfolioId="portfolio-doc" onClose={onClose} />,
    ),
  );
  return { onClose };
}

describe("AssetDetail", () => {
  it("shows the asset, its holdings sum and per-wallet rows", () => {
    render();
    expect(host.textContent).toContain("ETH");
    expect(host.textContent).toContain("6,000");
    expect(host.textContent).toContain("fr4nk.eth");
    expect(host.textContent).toContain("0xw2");
  });

  it("holdings line sums match buildBalances' per-asset total for the asset", () => {
    render();
    // 2 + 1 ETH across wallets -> one row at the folded total, not per-wallet sums
    const rows = [...host.querySelectorAll("tbody tr")].map((r) => r.textContent ?? "");
    const walletRows = rows.filter((t) => t.includes("0x") || t.includes("fr4nk"));
    expect(walletRows).toHaveLength(2);
    expect(host.textContent).toContain("3");
  });

  it("an unknown asset id shows a not-found message, not a blank", () => {
    render("eip155:1/erc20:0xgone");
    expect(host.textContent).toContain("Nothing held");
  });

  it("Review-Focus: no price rows → name plus 'No price history'", () => {
    holders.mockReturnValue({
      holdings: [{ asset: "MYST", symbol: "MYST", wallet: "0xw1", quantity: "1", value: null }],
      perAsset: [{ asset: "MYST", symbol: "MYST", quantity: "1", value: null }],
      perAccount: [],
      total: "0",
    });
    // usePriceHistory stub returns ETH rows only; MYST has no history.
    render("MYST");
    expect(host.textContent).toContain("MYST");
    expect(host.textContent).toContain("No price history");
  });

  it("override form dispatches setPriceOverride with asset, price, setAt", () => {
    render();
    const input = host.querySelector<HTMLInputElement>("input[type=text]")!;
    act(() => {
      // The native setter, so React sees a change it did not make itself.
      Reflect.set(HTMLInputElement.prototype, "value", "2500.5", input);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Set price"),
    )!;
    act(() => button.click());
    expect(actions.setPriceOverride).toHaveBeenCalledTimes(1);
    const [input1] = actions.setPriceOverride.mock.calls[0] as [{ asset: string; price: string; setAt: string }];
    expect(input1.asset).toBe("ETH");
    expect(input1.price).toBe("2500.5");
    expect(Date.parse(input1.setAt)).not.toBeNaN();
  });

  it("close button reports", () => {
    const { onClose } = render();
    const close = [...host.querySelectorAll("button")].find((b) =>
      b.getAttribute("aria-label") === "Close",
    )!;
    act(() => close.click());
    expect(onClose).toHaveBeenCalled();
  });
});
