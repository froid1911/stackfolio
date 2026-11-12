import { useSearchParams, useSetSearchParams } from "@powerhousedao/reactor-browser";

export type Tab =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "staking"
  | "pnl"
  | "assets"
  | "prices"
  | "files";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "transactions", label: "Transactions" },
  { id: "accounts", label: "Accounts" },
  { id: "staking", label: "Staking" },
  { id: "pnl", label: "P&L" },
  { id: "assets", label: "Assets" },
  { id: "prices", label: "Prices" },
  { id: "files", label: "Files" },
];

export function isTab(value: unknown): value is Tab {
  return TABS.some((t) => t.id === value);
}

/** The view switch, kept in the URL so Back and reloads land the same. */
export function Nav() {
  const { tab } = useSearchParams();
  const setSearchParams = useSetSearchParams();
  const current: Tab = (TABS.find((t) => t.id === tab)?.id ??
    "dashboard");
  return (
    <nav className="flex gap-1 border-b border-border px-4">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setSearchParams({ tab: t.id })}
          className={
            current === t.id
              ? "border-b-2 border-accent px-3 py-2 text-sm font-semibold text-foreground"
              : "border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          }
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
