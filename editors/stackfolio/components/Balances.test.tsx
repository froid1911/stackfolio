// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import type { Asset, QueryState } from "../lib/graphql.js";
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

const ASSETS: Asset[] = [
  {
    documentId: "doc",
    identifier: "ETH",
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    kind: "NATIVE",
    chainId: 1,
    coingeckoId: "ethereum",
    custom: false,
  },
  {
    documentId: "doc",
    identifier: "DAI",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    kind: "ERC20",
    chainId: 1,
    coingeckoId: "dai",
    custom: false,
  },
  {
    documentId: "doc",
    identifier: "MYS",
    symbol: "MYS",
    name: "Mystery token",
    decimals: 18,
    kind: "ERC20",
    chainId: 1,
    coingeckoId: null,
    custom: false,
  },
  {
    documentId: "doc",
    identifier: "SPAM",
    symbol: "US\u200BDT",
    name: "Tether",
    decimals: 6,
    kind: "ERC20",
    chainId: 1,
    coingeckoId: null,
    custom: false,
  },
];

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
        assets={ok(ASSETS)}
        holdings={holdings}
        onOpenAsset={vi.fn()}
        onOpenAccount={vi.fn()}
        {...props}
      />,
    ),
  );
}

function rowFor(text: string): string {
  return (
    [...host.querySelectorAll("tbody tr")].find((r) => r.textContent?.includes(text))
      ?.textContent ?? ""
  );
}

describe("Balances view", () => {
  it("renders valued assets with formatted quantities and registry names", () => {
    render();
    expect(rowFor("Ether")).toContain("3");
    expect(rowFor("Dai Stablecoin")).toContain("0.3");
    expect(host.textContent).toContain("Total (valued)");
    expect(host.textContent).toContain("6,000.3");
  });

  it("keeps decimal-exact sums without float tails", () => {
    render();
    expect(rowFor("Dai Stablecoin")).not.toContain("0.30000000000000004");
  });

  it("excludes unpriced holdings from totals and offers them separately", () => {
    render();
    expect(rowFor("Mystery token")).toBe("");
    expect(host.textContent).toContain("1 unpriced");
  });

  it("never renders a spoofed ticker in the valued table", () => {
    render();
    expect(host.textContent).not.toContain("US\u200BDT");
  });
});
