import { useDocumentById } from "@powerhousedao/reactor-browser";
import { actions } from "document-models/wallet-account";
import { useState } from "react";
import type { AccountRow, Issue, QueryState } from "../lib/graphql.js";
import { fmtAmount } from "../lib/format.js";

/**
 * The wallet accounts the drive tracks. Rows read from the index; the
 * ignore switch writes straight to the owning wallet document. The scan
 * itself is a scheduled workflow run — the manual "run now" trigger joins
 * it once the runner exposes the endpoint.
 */
export function Accounts({
  accounts,
  issues,
}: {
  accounts: QueryState<AccountRow[]>;
  issues: QueryState<Issue[]>;
}) {
  if (accounts.error) return <p className="p-6 text-red-700">{accounts.error}</p>;
  if (!accounts.data) return <p className="p-6 text-muted-foreground">Loading accounts…</p>;
  const byAccount = new Map<string, Issue[]>();
  for (const issue of issues.data ?? []) {
    if (!issue.accountId) continue;
    const list = byAccount.get(issue.accountId) ?? [];
    list.push(issue);
    byAccount.set(issue.accountId, list);
  }
  return (
    <div className="p-6">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            <th className="py-2">Account</th>
            <th>Chain</th>
            <th>Native balance</th>
            <th>Last run</th>
            <th>Backfill</th>
            <th>Health</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {accounts.data.map((row) => (
            <AccountRowView
              key={row.documentId}
              row={row}
              issues={byAccount.get(row.documentId) ?? []}
              onReload={accounts.reload}
            />
          ))}
          {accounts.data.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-muted-foreground">
                No accounts yet — add one from the Setup wizard.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AccountRowView({
  row,
  issues,
  onReload,
}: {
  row: AccountRow;
  issues: Issue[];
  onReload: () => void;
}) {
  const [, dispatch] = useDocumentById(row.documentId);
  const [error, setError] = useState<string | null>(null);
  const blocking = issues.some((i) => i.severity === "BLOCKING");
  const health = issues.length === 0
    ? { text: "ok", tone: "text-success" }
    : blocking
      ? { text: `${issues.length} issues`, tone: "text-red-700" }
      : { text: `${issues.length} warnings`, tone: "text-warning" };
  const backfill =
    row.backfillState === null || row.backfillState === "IDLE" || row.backfillState === "DONE"
      ? row.backfillState === "DONE"
        ? "history done"
        : "—"
      : `backfilling ${row.backfillState.toLowerCase()}`;
  return (
    <tr className="border-t border-border">
      <td className="py-2">
        <div className="font-medium">{row.label ?? "unlabelled"}</div>
        <div className="font-mono text-xs">{row.address}</div>
        {error && <div className="text-xs text-red-700">{error}</div>}
      </td>
      <td>{row.chainId}</td>
      <td>
        {row.nativeBalance === null ? (
          "—"
        ) : (
          <>
            {fmtAmount(row.nativeBalance, 18, 5)} ETH
            {row.nativeBalanceBlock !== null && (
              <span className="text-xs text-muted-foreground"> #{row.nativeBalanceBlock}</span>
            )}
          </>
        )}
      </td>
      <td>{row.lastRunAt ? new Date(row.lastRunAt).toLocaleString() : "never"}</td>
      <td>{backfill}</td>
      <td className={health.tone} title={issues.map((i) => i.message).join("\n")}>
        {health.text}
      </td>
      <td className="text-right">
        <button
          type="button"
          className="text-xs underline"
          onClick={() => {
            setError(null);
            dispatch(
              actions.setIgnored({ ignored: !row.ignored }),
              (errors) => setError(errors[0]?.message),
              () => onReload(),
            );
          }}
        >
          {row.ignored ? "un-ignore" : "ignore"}
        </button>
      </td>
    </tr>
  );
}
