// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventDetail } from "./EventDetail.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EVENT = {
  documentId: "doc-1",
  eventId: "ev-1",
  eventIdentifier: "0xfeedface_0",
  sequenceIndex: 0,
  timestamp: "2026-11-01T10:00:00Z",
  type: "SPEND",
  subtype: "NONE",
  asset: "eip155:1/slip44:60",
  amount: "1500000000000000000",
  counterparty: "0xbeef",
  counterpartyLabel: "uniswap",
  notes: "swap fee",
  ignored: false,
  source: "CHAIN",
  address: "0xfrank",
  chainId: 1,
  label: "hot",
};

vi.mock("../lib/graphql.js", () => ({
  useEventsPage: (_driveId: string, filter: { ids?: string[] }) => ({
    data:
      filter?.ids?.[0] === "ev-1"
        ? { rows: [EVENT], total: 1 }
        : { rows: [], total: 0 },
    error: null,
    loading: false,
    reload: () => {},
  }),
  useAssets: () => ({
    data: [
      { documentId: "d", identifier: "eip155:1/slip44:60", symbol: "ETH", name: "Ether", decimals: 18, kind: "NATIVE", chainId: 1, coingeckoId: null, custom: false },
    ],
    error: null,
    loading: false,
    reload: () => {},
  }),
  useAddressLabels: () => ({
    data: [{ documentId: "d", address: "0xbeef", label: "uniswap", ensName: null }],
    error: null,
    loading: false,
    reload: () => {},
  }),
  useRealizedEvents: () => ({
    data: [{ id: "r-1", wallet: "0xfrank", asset: "eip155:1/slip44:60", timestamp: "2026-11-01T10:00:00Z", quantity: "1", cost: "1", proceeds: "2", pnl: "1", sourceEventId: "ev-1", sourceSeq: 0, consumed: [] }],
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

function render(eventId = "ev-1", props: Partial<Parameters<typeof EventDetail>[0]> = {}) {
  const onClose = vi.fn();
  const onOpenAccount = vi.fn();
  const onOpenHistory = vi.fn();
  const onOpenPnl = vi.fn();
  act(() =>
    root.render(
      <EventDetail
        driveId="drive"
        eventId={eventId}
        onClose={onClose}
        onOpenAccount={onOpenAccount}
        onOpenHistory={onOpenHistory}
        onOpenPnl={onOpenPnl}
        {...props}
      />,
    ),
  );
  return { onClose, onOpenAccount, onOpenHistory, onOpenPnl };
}

describe("EventDetail", () => {
  it("renders the full row: kind, amount, asset, time, counterparty, tx, account", () => {
    render();
    const t = host.textContent ?? "";
    expect(t).toContain("SPEND");
    expect(t).toContain("ETH");
    expect(t).toContain("0xfeedface_0");
    expect(t).toContain("uniswap");
    expect(t).toContain("swap fee");
    expect(t).toContain("hot");
  });

  it("Review-Focus: unknown event id → 'No such event' plus a working close", () => {
    const { onClose } = render("ev-gone");
    expect(host.textContent).toContain("No such event");
    const close = host.querySelector<HTMLButtonElement>("[aria-label=Close]")!;
    act(() => close.click());
    expect(onClose).toHaveBeenCalled();
  });

  it("Review-Focus: an event whose wallet vanished still renders its fields", () => {
    // The event's own address/label come from the event row, not live
    // account rows; the address-labels stub knows nothing of 0xfrank.
    render();
    const t = host.textContent ?? "";
    expect(t).toContain("hot"); // the event's stored label
    expect(t).not.toContain("No such event");
  });

  it("actions: open in history filtered, open account, close", () => {
    const { onOpenAccount, onOpenHistory, onClose } = render();
    const history = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("history"),
    )!;
    act(() => history.click());
    expect(onOpenHistory).toHaveBeenCalledWith(["ev-1"]);
    const account = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("hot"),
    )!;
    act(() => account.click());
    expect(onOpenAccount).toHaveBeenCalledWith("0xfrank");
    const close = host.querySelector<HTMLButtonElement>("[aria-label=Close]")!;
    act(() => close.click());
    expect(onClose).toHaveBeenCalled();
  });

  it("an event that realized P&L links there", () => {
    // The realized stub names ev-1 as its source event: the link shows.
    const onOpenPnl = vi.fn();
    render("ev-1", { onOpenPnl });
    expect(host.textContent).toContain("P&L");
    const link = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("P&L"),
    )!;
    act(() => link.click());
    expect(onOpenPnl).toHaveBeenCalled();
  });
});
