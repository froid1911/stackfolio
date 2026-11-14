// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import type { Queue, QueryState } from "../lib/graphql.js";
import { UnclassifiedNotice } from "./UnclassifiedNotice.js";

const ok = (data: Queue): QueryState<Queue> => ({ data, error: null, loading: false, reload: () => {} });
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

describe("UnclassifiedNotice", () => {
  it("stays out of the way when nothing waits", () => {
    act(() => root.render(<UnclassifiedNotice queue={ok({ total: 0, value: null, groups: [] })} onOpen={() => {}} />));
    expect(host.textContent).toBe("");
  });

  it("counts and values the waiting transactions and links to the queue", () => {
    const onOpen = vi.fn();
    act(() => root.render(<UnclassifiedNotice queue={ok({ total: 12, value: "1234.5", groups: [] })} onOpen={onOpen} />));
    expect(host.textContent).toContain("12 transactions unclassified (€1,234.50)");
    act(() => host.querySelector("button")?.click());
    expect(onOpen).toHaveBeenCalled();
  });
});
