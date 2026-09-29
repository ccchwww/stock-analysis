import type { BreakEven } from "@/lib/cost-model";
import { formatPct, formatSignedPct, toneOf, toneTextClass } from "@/lib/format";

// How much of each strategy's result survives its own trading costs.
//
// The daily-rebalanced strategies here turn the whole basket over almost
// every session, so their result is far more a statement about the assumed
// cost than about the signal. Showing total return across a range of cost
// levels, plus the exact level at which the edge disappears, is the honest
// way to present that: a strategy that only wins below 3 bps has not really
// won.

export type CostRow = {
  id: string;
  label: string;
  color: string;
  /** Total return at each level in `levels`, same order. */
  totalReturns: (number | null)[];
  /** Difference vs Buy & Hold at the default cost level, in points. */
  breakEven: BreakEven;
  isBenchmarkStrategy: boolean;
};

function breakEvenText(breakEven: BreakEven, maxBps: number): { text: string; tone: string } {
  switch (breakEven.kind) {
    case "solved":
      return { text: `${breakEven.bps.toFixed(1)} bps`, tone: "text-zinc-200" };
    case "loses_at_zero":
      return {
        text: "Underperforms Buy & Hold even with zero costs",
        tone: "text-red-400",
      };
    case "beyond_range":
      return { text: `Still ahead at ${maxBps} bps`, tone: "text-emerald-400" };
    default:
      return { text: "n/a", tone: "text-zinc-500" };
  }
}

export default function CostSensitivity({
  rows,
  levels,
  defaultBps,
  maxSearchBps,
  startDate,
  benchmarkLabel,
}: {
  rows: CostRow[];
  levels: number[];
  defaultBps: number;
  maxSearchBps: number;
  startDate: string;
  benchmarkLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Cost sensitivity</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Total return from {startDate} at a range of one-way transaction costs, and the
          break-even cost at which each strategy ties {benchmarkLabel}. Both sides are
          re-priced at each level — {benchmarkLabel} pays its own buy-in cost too.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Strategy</th>
              {levels.map((bps) => (
                <th key={bps} className="px-4 py-3 text-right font-medium">
                  {bps} bps
                  {bps === defaultBps && (
                    <span className="ml-1 text-[10px] font-semibold normal-case text-emerald-400">
                      default
                    </span>
                  )}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Break-even</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const be = breakEvenText(row.breakEven, maxSearchBps);
              return (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="font-medium text-foreground">{row.label}</span>
                    </div>
                  </td>
                  {row.totalReturns.map((value, i) => (
                    <td
                      key={levels[i]}
                      className={`whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums ${
                        value !== null ? toneTextClass(toneOf(value)) : "text-zinc-500"
                      } ${levels[i] === defaultBps ? "bg-emerald-500/5" : ""}`}
                    >
                      {value !== null ? formatSignedPct(value, 1) : "n/a"}
                    </td>
                  ))}
                  <td className={`px-4 py-3 text-right text-xs font-medium ${be.tone}`}>
                    {row.isBenchmarkStrategy ? "—" : be.text}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          Assumptions &amp; limitations
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-zinc-400">
          <li>
            The {formatPct(defaultBps / 10_000, 2).replace("%", "")}% ({defaultBps} bps) default
            is a <span className="text-zinc-200">floor, not an estimate</span>. It is a plausible
            commission-like cost for large, liquid names. Real execution also pays the bid-ask
            spread and market impact, both materially wider for less liquid names — so the
            higher columns are closer to a realistic cost than the lower ones.
          </li>
          <li>
            Cost is charged on realized turnover only. Other real frictions — taxes, borrowing,
            failed fills, the fact that a daily strategy must actually be traded every single
            session — are not modelled at all.
          </li>
          <li>
            Break-even is solved by bisection to 0.01 bps, searching 0 to {maxSearchBps} bps.
            It relies on total return falling as cost rises, which holds because every active
            strategy trades more than {benchmarkLabel} does.
          </li>
          <li>
            Re-pricing is exact, not interpolated: cost enters each day&rsquo;s return as
            turnover × bps, and no strategy&rsquo;s stock selection depends on the cost
            assumption, so the basket is identical at every level. The backtest re-verifies that
            identity against a real re-run each time the data refreshes.
          </li>
        </ul>
      </div>
    </div>
  );
}
