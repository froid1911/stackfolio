/**
 * CSV export for the tables the views show. Escape rules follow RFC 4180
 * (quote when the cell holds a separator, quote or newline; quotes double)
 * plus the OWASP formula-injection guard: a cell starting with = + - @,
 * TAB or CR gets a leading apostrophe, so a spreadsheet never executes
 * what the ledger merely recorded.
 */

type Cell = string | number | null | undefined;

const DANGEROUS = /^[=+\-@\t\r]/;

/** One cell as CSV text: guarded, quoted when needed, nullish empty. */
export function csvEscape(cell: Cell): string {
  if (cell === null || cell === undefined) return "";
  const raw = typeof cell === "number" ? String(cell) : cell;
  // OWASP guard: a spreadsheet executes a cell whose first character is
  // = + - @ or a control; the apostrophe prefix stops it. The apostrophe
  // alone, however, does not neutralize a separator (the field would
  // still split on the comma) or a line break (an unquoted CR would end
  // the row), so those still quote — with the apostrophe inside.
  const guarded = DANGEROUS.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(raw) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Headers and rows to a CRLF-terminated CSV document; rows pad to width. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const width = headers.length;
  const line = (cells: Cell[]): string =>
    Array.from({ length: width }, (_, i) => csvEscape(cells[i] ?? null))
      .join(",") + "\r\n";
  return line(headers) + rows.map(line).join("");
}

export interface DownloadEnv {
  document: Document;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

/**
 * Hand the CSV to the browser as a file download. The environment is
 * injectable so the click-and-revoke contract is testable without a DOM.
 */
export function downloadCsv(
  filename: string,
  csv: string,
  env: DownloadEnv = {
    document,
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  },
): void {
  // BOM keeps Excel reading UTF-8 (the ledger speaks ENS names and emoji).
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = env.createObjectURL(blob);
  const anchor = env.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  env.document.body.appendChild(anchor);
  anchor.click();
  env.document.body.removeChild(anchor);
  env.revokeObjectURL(url);
}
