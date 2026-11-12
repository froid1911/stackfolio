/**
 * The drawer shell: rotki's mental model — Overview (state and events),
 * Manage (reference data), plus drive chrome in the header. Entries come
 * from nav.ts; the active entry is a prop, derived by the route.
 */
import { NAV_ENTRIES, navSections, type Page } from "../nav.js";

export interface ShellProps {
  driveName: string;
  active: Page;
  onNavigate: (page: Page) => void;
  onOpenFiles: () => void;
  onSearchOpen: () => void;
  filesActive?: boolean;
  children: React.ReactNode;
}

export function Shell({
  driveName,
  active,
  onNavigate,
  onOpenFiles,
  onSearchOpen,
  filesActive = false,
  children,
}: ShellProps) {
  return (
    <div className="flex h-full w-full">
      <nav className="flex w-52 shrink-0 flex-col border-r border-border md:w-14 xl:w-52">
        <div className="truncate px-3 py-3 text-sm font-semibold">{driveName}</div>
        {navSections().map(({ section, entries }) => (
          <div key={section} className="mt-2">
            <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground max-xl:hidden">
              {section}
            </p>
            {entries.map((e) => (
              <button
                key={e.page}
                type="button"
                title={e.label}
                onClick={() => onNavigate(e.page)}
                className={
                  active === e.page
                    ? "flex items-center gap-2 bg-accent px-3 py-2 text-left text-sm font-semibold text-foreground"
                    : "flex items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                }
              >
                <span aria-hidden className="w-4 text-center">
                  {e.glyph}
                </span>
                <span className="max-xl:hidden">{e.label}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="mt-auto border-t border-border">
          <button
            type="button"
            title="Files"
            onClick={onOpenFiles}
            className={
              filesActive
                ? "flex w-full items-center gap-2 bg-accent px-3 py-2 text-left text-sm font-semibold"
                : "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            }
          >
            <span aria-hidden className="w-4 text-center">
              ▤
            </span>
            <span className="max-xl:hidden">Files</span>
          </button>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-2 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={onSearchOpen}
            className="rounded border border-border px-3 py-1 text-sm text-muted-foreground hover:bg-accent"
            title="Search (Ctrl+K)"
          >
            Search…
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

/** Label lookup for titles/palette; single source stays NAV_ENTRIES. */
export function navLabel(page: Page): string {
  return NAV_ENTRIES.find((e) => e.page === page)?.label ?? page;
}
