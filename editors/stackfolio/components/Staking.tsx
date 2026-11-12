/**
 * ETH staking: the drive's validators, their daily balances and the
 * withdrawals that reached the portfolio.
 */
import type { QueryState, StakingBalance, Validator, Withdrawal } from "../lib/graphql.js";
import { fmtAmount } from "../lib/format.js";
import { short } from "./Dashboard.js";
import { Bars } from "../lib/charts.js";

function status(v: Validator, now: number): { text: string; tone: string } {
  if (v.withdrawableTs !== null && v.withdrawableTs * 1000 <= now)
    return { text: "withdrawable", tone: "text-muted-foreground" };
  if (v.exitedTs !== null && v.exitedTs * 1000 <= now)
    return { text: "exited", tone: "text-warning" };
  if (v.activationTs !== null && v.activationTs * 1000 <= now)
    return { text: "active", tone: "text-success" };
  return { text: "pending", tone: "text-sky-600" };
}

export function Staking({
  validators,
  balances: history,
  withdrawals: wds,
  picked,
  setPicked,
  now,
}: {
  validators: QueryState<Validator[]>;
  balances: QueryState<StakingBalance[]>;
  withdrawals: QueryState<Withdrawal[]>;
  picked: number | undefined;
  setPicked: (v: number | undefined) => void;
  now: number;
}) {

  if (validators.error) return <p className="p-6 text-red-700">{validators.error}</p>;
  if (!validators.data) return <p className="p-6 text-muted-foreground">Loading validators…</p>;
  const vs = validators.data;

  return (
    <div className="grid gap-4 p-6">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Validator</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Activated</th>
              <th className="px-3 py-2">Exited</th>
              <th className="px-3 py-2">Withdrawal address</th>
            </tr>
          </thead>
          <tbody>
            {vs.map((v) => {
              const st = status(v, now);
              return (
                <tr
                  key={`${v.documentId}/${v.validatorIndex}`}
                  onClick={() => setPicked(picked === v.validatorIndex ? undefined : v.validatorIndex)}
                  className={`cursor-pointer border-t border-border ${picked === v.validatorIndex ? "bg-muted/40" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    #{v.validatorIndex}{" "}
                    <span className="font-normal text-muted-foreground">
                      {short(v.publicKey)}…
                    </span>
                  </td>
                  <td className={`px-3 py-2 ${st.tone}`}>{st.text}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {v.activationTs ? new Date(v.activationTs * 1000).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {v.exitedTs ? new Date(v.exitedTs * 1000).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {v.withdrawalAddress ? short(v.withdrawalAddress) : "—"}
                  </td>
                </tr>
              );
            })}
            {vs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  No validators yet — the daily staking read fills this in.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {vs.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {picked === undefined ? "Click a validator to focus its history." : `Focused on #${picked} — click again to clear.`}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">
            Daily balances {picked !== undefined ? `· validator #${picked}` : ""}
          </p>
          <div className="mt-3">
            <Bars
              values={(history.data ?? []).map((b) => Number(b.balanceGwei) / 1e9)}
              labels={(history.data ?? []).map((b) => b.day)}
            />
            {(history.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No balance history yet.</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">
            Withdrawals {picked !== undefined ? `· validator #${picked}` : ""}
          </p>
          <ul className="mt-2 grid gap-2 text-xs">
            {(wds.data ?? []).slice(0, 12).map((w) => (
              <li key={`${w.documentId}/${w.withdrawalRef}`} className="flex justify-between border-b border-border pb-1.5">
                <span className="text-muted-foreground">
                  #{w.validatorIndex} · block {w.blockNumber} ·{" "}
                  {new Date(w.timestamp).toLocaleDateString()}
                </span>
                <span className="tabular-nums">{fmtAmount(w.amountGwei, 9, 5)} ETH</span>
              </li>
            ))}
            {(wds.data ?? []).length === 0 && (
              <li className="text-muted-foreground">Nothing withdrawn yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
