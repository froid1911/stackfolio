import { afterEach, describe, expect, it, vi } from "vitest";

import { stateFetcher } from "./delivery.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stateFetcher", () => {
  it("warns once per unreadable document and debugs repeats", async () => {
    const read = {
      get: vi.fn(async () => {
        throw new Error("Document not found: doc-a");
      }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const fetchState = stateFetcher(read, "dedupe-a");

    expect(await fetchState("doc-a")).toBeUndefined();
    expect(await fetchState("doc-a")).toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("Document not found: doc-a");
  });

  it("dedupes across fetcher instances and keys per document", async () => {
    const read = {
      get: vi.fn(async () => {
        throw new Error("Document not found");
      }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});

    await stateFetcher(read, "dedupe-b")("doc-b");
    await stateFetcher(read, "dedupe-b")("doc-b");
    await stateFetcher(read, "dedupe-b")("doc-c");

    expect(warn).toHaveBeenCalledTimes(2);
  });
});
