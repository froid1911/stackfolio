/**
 * The drawer's navigation as data: one table drives the sidebar, the
 * route's page guard, and the command palette's navigation hits. A view
 * NEVER hardcodes a nav label or order.
 */
export type Page =
  | "dashboard"
  | "balances"
  | "history"
  | "pnl"
  | "staking"
  | "address-book"
  | "assets"
  | "prices"
  | "defi";

export type NavSection = "Overview" | "Manage" | "Portfolio";

export interface NavEntry {
  page: Page;
  label: string;
  /** Single glyph for the collapsed rail; full icons come later. */
  glyph: string;
  section: NavSection;
  order: number;
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { page: "dashboard", label: "Dashboard", glyph: "◆", section: "Overview", order: 10 },
  { page: "balances", label: "Balances", glyph: "≡", section: "Overview", order: 20 },
  { page: "history", label: "History", glyph: "↺", section: "Overview", order: 30 },
  { page: "pnl", label: "P&L", glyph: "↗", section: "Overview", order: 40 },
  { page: "staking", label: "Staking", glyph: "▲", section: "Overview", order: 50 },
  { page: "address-book", label: "Address book", glyph: "✎", section: "Manage", order: 10 },
  { page: "assets", label: "Assets", glyph: "◈", section: "Manage", order: 20 },
  { page: "prices", label: "Prices", glyph: "$", section: "Manage", order: 30 },
  { page: "defi", label: "DeFi", glyph: "⬡", section: "Manage", order: 40 },
];

export function isPage(value: unknown): value is Page {
  return NAV_ENTRIES.some((e) => e.page === value);
}

/** Entries grouped by section, in table order (sections appear top-down). */
export function navSections(): { section: NavSection; entries: NavEntry[] }[] {
  const out: { section: NavSection; entries: NavEntry[] }[] = [];
  for (const entry of NAV_ENTRIES) {
    const last = out[out.length - 1];
    if (last && last.section === entry.section) last.entries.push(entry);
    else out.push({ section: entry.section, entries: [entry] });
  }
  return out;
}
