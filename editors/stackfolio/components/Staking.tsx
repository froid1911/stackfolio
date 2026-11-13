/**
 * ETH staking: the drive's validators, their daily balances and the
 * withdrawals that reached the portfolio.
 *
 * Each validator gets a summary card — balance now, 7d and 30d delta, an APR
 * estimate from the observed balance growth and the total withdrawn — so the
 * page answers "how did my validators behave" without opening a table.
 */
import type { QueryState, StakingBalance, Validator, Withdrawal } from "../lib/graphql.js";
import { useState } from "react";
import { fmtAmount } from "../lib/format.js";
import { short } from "./Dashboard.js";
import { ValueHistory } from "../lib/echart.js";

function status(v: Validator, now: number): { text: string; tone: string } {
  if (v.withdrawableTs !== null && v.withdrawableTs * 1000 <= now)
    return { text: "withdrawable", tone: "text-muted-foreground" };
  if (v.exitedTs !== null && v.exitedTs * 1000 <= now)
    return { text: "exited", tone: "text-warning" };
  if (v.activationTs !== null && v.activationTs * 1000 <= now)
    return { text: "active", tone: "text-success" };
  return { text: "pending", tone: "text-sky-600" };
}

const gwei = (v: string) => Number(v) / 1e9;
const eth = (v: number) => `${v.toFixed(4)} ETH`;
const signed = (v: number | null) =>
  v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(4)} ETH`;

interface Summary {
  now: number;
  delta7d: number | null;
  delta30d: number | null;
  apr: number | null;
  withdrawn: number;
  rows: number;
}

function summaryFor(
  index: number,
  balances: StakingBalance[],
  withdrawals: Withdrawal[],
): Summary {
  const rows = balances
    .filter((b) => b.validatorIndex === index)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (rows.length === 0)
    return { now: 0, delta7d: null, delta30d: null, apr: null, withdrawn: 0, rows: 0 };
  const last = rows.at(-1)!;
  const first = rows[0]!;
  const lastTime = new Date(last.day).getTime();
  const firstTime = new Date(first.day).getTime();
  const days = Math.max(1, Math.round((lastTime - firstTime) / 86_400_000));
  const at = (daysAgo: number): number | null => {
    const target = lastTime - daysAgo * 86_400_000;
    let found: StakingBalance | null = null;
    for (const row of rows) {
      if (new Date(row.day).getTime() <= target) found = row;
      else break;
    }
    return found ? gwei(found.balanceGwei) : null;
  };
  const now = gwei(last.balanceGwei);
  const start = gwei(first.balanceGwei);
  const seven = at(7);
  const thirty = at(30);
  return {
    now,
    delta7d: seven === null ? null : now - seven,
    delta30d: thirty === null ? null : now - thirty,
    apr: start > 0 ? ((now - start) / start) * (365 / days) : null,
    withdrawn: withdrawals
      .filter((w) => w.validatorIndex === index)
      .reduce((sum, w) => sum + gwei(w.amountGwei), 0),
    rows: rows.length,
  };
}

export function Staking({
  validators,
  balances,
  withdrawals: wds,
  picked,
  setPicked,
  now,
  watchEnabled,
  onWatch,
  onRemove,
  onSync,
  syncStatus,
}: {
  validators: QueryState<Validator[]>;
  balances: QueryState<StakingBalance[]>;
  withdrawals: QueryState<Withdrawal[]>;
  picked: number | undefined;
  setPicked: (v: number | undefined) => void;
  now: number;
  watchEnabled: boolean;
  onWatch: (index: number) => void;
  onRemove: (index: number) => void;
  onSync: () => void;
  syncStatus: string;
}) {
  const [indexDraft, setIndexDraft] = useState("");

  if (validators.error) return <p className="p-6 text-red-700">{validators.error}</p>;
  if (!validators.data) return <p className="p-6 text-muted-foreground">Loading validators…</p>;
  const vs = validators.data;
  const summaries = vs.map((v) => ({
    v,
    ...summaryFor(v.validatorIndex, balances.data ?? [], wds.data ?? []),
  }));
  const history = picked !== undefined
    ? (balances.data ?? [])
        .filter((b) => b.validatorIndex === picked)
        .sort((a, b) => a.day.localeCompare(b.day))
    : [];
  const points = history.map((b) => ({ at: b.day, value: gwei(b.balanceGwei) }));

  return (
    <div className="grid gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const index = Number(indexDraft);
            if (!Number.isInteger(index) || index < 0) return;
            onWatch(index);
            setIndexDraft("");
          }}
        >
          <input
            type="number"
            min={0}
            value={indexDraft}
            onChange={(e) => setIndexDraft(e.target.value)}
            placeholder="validator index"
            className="w-36 rounded border border-border bg-background px-2 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={!watchEnabled || indexDraft === ""}
            className="rounded border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            Watch validator
          </button>
        </form>
        <button
          type="button"
          onClick={onSync}
          disabled={!watchEnabled}
          className="rounded border border-border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Sync now
        </button>
        {syncStatus && <span className="text-xs text-muted-foreground">{syncStatus}</span>}
      </div>
      {!watchEnabled && (
        <p className="text-xs text-muted-foreground">
          No ETH staking document in this drive yet — the setup wizard creates one;
          then validators can be watched and synced.
        </p>
      )}

      {summaries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {summaries.map((s) => {
            const st = status(s.v, now);
            const active = picked === s.v.validatorIndex;
            return (
              <button
                key={`${s.v.documentId}/${s.v.validatorIndex}`}
                type="button"
                onClick={() => setPicked(active ? undefined : s.v.validatorIndex)}
                className={`rounded-xl border p-4 text-left ${
                  active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">#{s.v.validatorIndex}</p>
                  <p className={`text-xs ${st.tone}`}>{st.text}</p>
                </div>
                <p className="mt-1 text-lg font-semibold">{eth(s.now)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  7d {signed(s.delta7d)} · 30d {signed(s.delta30d)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  APR {s.apr === null ? "—" : `${(s.apr * 100).toFixed(2)}%`} (estimate)
                  {" · "}withdrawn {eth(s.withdrawn)}
                </p>
                {s.rows === 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    No daily balances yet — the staking read fills them in.
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Validator</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-right">7d</th>
              <th className="px-3 py-2 text-right">30d</th>
              <th className="px-3 py-2">Activated</th>
              <th className="px-3 py-2">Exited</th>
              <th className="px-3 py-2">Withdrawal address</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => {
              const st = status(s.v, now);
              return (
                <tr
                  key={`${s.v.documentId}/${s.v.validatorIndex}`}
                  onClick={() => setPicked(picked === s.v.validatorIndex ? undefined : s.v.validatorIndex)}
                  className={`cursor-pointer border-t border-border ${picked === s.v.validatorIndex ? "bg-muted/40" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    #{s.v.validatorIndex}{" "}
                    <span className="font-normal text-muted-foreground">{short(s.v.publicKey)}…</span>
                  </td>
                  <td className={`px-3 py-2 ${st.tone}`}>{st.text}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{eth(s.now)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${s.delta7d !== null && s.delta7d < 0 ? "text-red-600" : ""}`}>
                    {signed(s.delta7d)}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${s.delta30d !== null && s.delta30d < 0 ? "text-red-600" : ""}`}>
                    {signed(s.delta30d)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.v.activationTs ? new Date(s.v.activationTs * 1000).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.v.exitedTs ? new Date(s.v.exitedTs * 1000).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {s.v.withdrawalAddress ? short(s.v.withdrawalAddress) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {watchEnabled && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline hover:text-red-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(s.v.validatorIndex);
                        }}
                      >
                        remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {vs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  No validators watched — add an index above, or the daily staking
                  read fills this in for any validator withdrawing to a tracked wallet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              Daily balances {picked !== undefined ? `· validator #${picked}` : ""}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {points.length === 0
                ? "pick a validator"
                : `${points.length} day${points.length === 1 ? "" : "s"} observed`}
            </p>
          </div>
          <div className="mt-3">
            {picked === undefined ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Pick a validator above to see its balance history.
              </p>
            ) : (
              <ValueHistory
                points={points}
                formatValue={eth}
                ariaLabel={`validator #${picked} balance history`}
              />
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">
            Withdrawals {picked !== undefined ? `· validator #${picked}` : ""}
          </p>
          <ul className="mt-2 grid gap-2 text-xs">
            {(wds.data ?? [])
              .filter((w) => picked === undefined || w.validatorIndex === picked)
              .slice(0, 12)
              .map((w) => (
                <li key={`${w.documentId}/${w.withdrawalRef}`} className="flex justify-between border-b border-border pb-1.5">
                  <span className="text-muted-foreground">
                    #{w.validatorIndex} · block {w.blockNumber} ·{" "}
                    {new Date(w.timestamp).toLocaleDateString()}
                  </span>
                  <span className="tabular-nums">{fmtAmount(w.amountGwei, 9, 5)} ETH</span>
                </li>
              ))}
            {(wds.data ?? []).filter((w) => picked === undefined || w.validatorIndex === picked).length === 0 && (
              <li className="text-muted-foreground">Nothing withdrawn yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
