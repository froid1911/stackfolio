import { deleteNode, useDocumentById, useSelectedDrive } from "@powerhousedao/reactor-browser";
import { actions } from "document-models/wallet-account";
import { useState } from "react";
import type { AccountRow, Issue, QueryState } from "../lib/graphql.js";
import { fmtAmount } from "../lib/format.js";
import { EVM_CHAINS } from "./Setup.js";

/** The address's chain rows behind one header: total native balance and
 * the number of chains, so a seven-chain address reads as one account. */
function GroupRows({
  group,
  issues,
  chainLabel,
  onReload,
}: {
  group: AccountRow[];
  issues: Map<string, Issue[]>;
  chainLabel: (id: number) => string;
  onReload: () => void;
}) {
  const evm = group.filter((r) => r.chainId !== 0 && r.nativeBalance !== null);
  const total = evm.reduce((sum, r) => sum + BigInt(r.nativeBalance as string), 0n);
  const name = group.find((r) => r.label)?.label ?? group[0].address;
  return (
    <>
      <tr className="border-t border-border bg-muted/40">
        <td className="py-2" colSpan={2}>
          <span className="font-medium">{name}</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {group[0].address}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {group.length === 1 ? "1 chain" : `${group.length} chains`}
          </span>
        </td>
        <td colSpan={2}>
          {total > 0n || evm.length > 0 ? `${fmtAmount(total.toString(), 18, 5)} ETH` : "—"}
        </td>
        <td colSpan={3} />
      </tr>
      {group.map((row) => (
        <AccountRowView
          key={row.documentId}
          row={row}
          chainName={chainLabel(row.chainId)}
          issues={issues.get(row.documentId) ?? []}
          onReload={onReload}
        />
      ))}
    </>
  );
}

/**
 * The wallet accounts the drive tracks. Rows read from the index; the
 * ignore switch writes straight to the owning wallet document and delete
 * retires it from the drive (two-step). The scan itself is a scheduled
 * workflow run; "sync now" lives with the DeFi sweep.
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
  // One address, one group: the chains it trades on read as its rows,
  // the group header carries the summed native balance.
  const sorted = [...accounts.data].sort(
    (a, b) =>
      a.address.toLowerCase().localeCompare(b.address.toLowerCase()) ||
      a.chainId - b.chainId,
  );
  const groups: AccountRow[][] = [];
  for (const row of sorted) {
    const last = groups.at(-1);
    if (last?.[0]?.address.toLowerCase() === row.address.toLowerCase()) last.push(row);
    else groups.push([row]);
  }
  const chainLabel = (id: number) =>
    id === 0 ? "Bitcoin" : (EVM_CHAINS.find((c) => c.id === id)?.name ?? String(id));
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
          {groups.map((group) => (
            <GroupRows
              key={group[0].address.toLowerCase()}
              group={group}
              issues={byAccount}
              chainLabel={chainLabel}
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
  chainName,
  issues,
  onReload,
}: {
  row: AccountRow;
  chainName: string;
  issues: Issue[];
  onReload: () => void;
}) {
  const [, dispatch] = useDocumentById(row.documentId);
  const [drive] = useSelectedDrive();
  const driveId = drive.header.id;
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
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
        <div className="text-sm">{row.label ?? "unlabelled"}</div>
        {error && <div className="text-xs text-red-700">{error}</div>}
      </td>
      <td>{chainName}</td>
      <td>
        {row.nativeBalance === null ? (
          "—"
        ) : (
          <>
            {/* Chain 0 is Bitcoin: sats and BTC, not wei and ETH. */}
            {fmtAmount(row.nativeBalance, row.chainId === 0 ? 8 : 18, 5)}{" "}
            {row.chainId === 0 ? "BTC" : "ETH"}
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
          className={`ml-3 text-xs underline ${confirming ? "text-red-700" : ""}`}
          onClick={() => {
            setError(null);
            if (!confirming) {
              setConfirming(true);
              return;
            }
            // Through the drive: the node goes with the document, so the
            // drive keeps no entry pointing at nothing.
            deleteNode(driveId, row.documentId)
              .then(onReload)
              .catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : String(cause)),
              );
          }}
        >
          {confirming ? "confirm delete" : "delete"}
        </button>
        <button
          type="button"
          className="ml-3 text-xs underline"
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
