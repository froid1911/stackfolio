import { describe, expect, it, vi } from "vitest";
import { csvEscape, downloadCsv, toCsv } from "./csv.js";

describe("csvEscape", () => {
  it("passes plain cells through", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape(42)).toBe("42");
  });

  it("empty and nullish cells are empty fields", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape("")).toBe("");
  });

  it("quotes cells with separators and doubles embedded quotes", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("keeps CR inside cells quoted (unquoted CR would end the row)", () => {
    expect(csvEscape("a\r\nb")).toBe('"a\r\nb"');
  });

  it("guards formula injection: leading = + - @ TAB get a quote prefix", () => {
    expect(csvEscape("=cmd")).toBe("'=cmd");
    expect(csvEscape("+cmd")).toBe("'+cmd");
    expect(csvEscape("-cmd")).toBe("'-cmd");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("\tcmd")).toBe("'\tcmd");
    // A leading CR guards too, and quotes, because an unquoted CR would
    // end the row; the guard and the quoting compose.
    expect(csvEscape("\rcmd")).toBe(`"'\rcmd"`);
  });

  it("a guarded cell is still a valid field: separators and quotes quote around the guard", () => {
    // An apostrophe prefix does not neutralize a field-splitting comma
    // or a row-terminating newline; those quote as usual, guard inside.
    expect(csvEscape("=1+1,x")).toBe('"\'=1+1,x"');
    expect(csvEscape('=a"b,c')).toBe('"\'=a""b,c"');
    expect(csvEscape("=a\nb")).toBe('"\'=a\nb"');
  });
});

describe("toCsv", () => {
  it("joins headers and rows with CRLF line endings", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        ["1", 2],
        ["x,y", null],
      ],
    );
    expect(csv).toBe('a,b\r\n1,2\r\n"x,y",\r\n');
  });

  it("ragged rows pad to the header width", () => {
    expect(toCsv(["a", "b", "c"], [["1"]])).toBe("a,b,c\r\n1,,\r\n");
  });
});

describe("downloadCsv", () => {
  it("builds a blob url, clicks an anchor with the filename, revokes", () => {
    const clicked: Array<{ download: string; href: string }> = [];
    const anchor = {
      download: "",
      href: "",
      click: () => clicked.push({ download: anchor.download, href: anchor.href }),
      style: {} as Record<string, string>,
    };
    const create = vi.fn(() => "blob:tmp/1");
    const revoke = vi.fn();
    const doc = {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    } as unknown as Document;

    downloadCsv("events.csv", "a,b\r\n1,2\r\n", {
      document: doc,
      createObjectURL: create,
      revokeObjectURL: revoke,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([{ download: "events.csv", href: "blob:tmp/1" }]);
    expect(revoke).toHaveBeenCalledWith("blob:tmp/1");
    expect((doc.body.appendChild as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    expect((doc.body.removeChild as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});
