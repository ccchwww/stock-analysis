import type { ReactNode } from "react";
import type { DerivedStats } from "@/lib/derived-stats";
import type { PerformanceRow } from "@/lib/risk-adjusted";
import { formatPct, formatSignedPct, toneOf, toneTextClass } from "@/lib/format";

function bestOf(rows: DerivedStats[], pick: (s: DerivedStats) => number | null): number | null {
  const values = rows.map(pick).filter((v): v is number => v !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function HighlightCell({
  isBest,
  className,
  children,
}: {
  isBest: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums ${className} ${
        isBest ? "bg-emerald-500/10" : ""
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {isBest && (
          <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wide text-emerald-400">
            Best
          </span>
        )}
      </span>
    </td>
  );
}

// Takes PerformanceRows rather than a strategy map so passive index
// benchmarks sit in the same table, scored by the identical code, and are
// distinguished by a label rather than by being computed differently. They
// DO compete for the "Best" highlight: if buying one fund beat every rule
// tested here, that is the finding, not an inconvenience to hide.
export default function ComparisonTable({ rows }: { rows: PerformanceRow[] }) {
  const stats = rows.map((r) => r.stats);

  const bestUpRate = bestOf(stats, (s) => s.upRate);
  const bestAvgReturn = bestOf(stats, (s) => s.avgReturn);
  const bestTotalReturn = bestOf(stats, (s) => s.totalReturn);
  const bestFinalValue = bestOf(stats, (s) => s.finalValue);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3 font-medium">Strategy</th>
            <th className="px-4 py-3 font-medium text-right">Up-Rate</th>
            <th className="px-4 py-3 font-medium text-right">Avg Return</th>
            <th className="px-4 py-3 font-medium text-right">Total Return</th>
            <th className="px-4 py-3 font-medium text-right">$10k Grew To</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const s = row.stats;
            return (
              <tr key={row.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <div>
                      <div className="font-medium text-foreground">
                        {row.label}
                        {row.kind === "benchmark" && (
                          <span className="ml-1 rounded bg-zinc-700/50 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                            Passive benchmark
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">{row.description}</div>
                    </div>
                  </div>
                </td>
                <HighlightCell
                  isBest={bestUpRate !== null && s.upRate === bestUpRate}
                  className="text-zinc-300"
                >
                  {s.upRate !== null ? formatPct(s.upRate) : "n/a"}
                </HighlightCell>
                <HighlightCell
                  isBest={bestAvgReturn !== null && s.avgReturn === bestAvgReturn}
                  className={s.avgReturn !== null ? toneTextClass(toneOf(s.avgReturn)) : "text-zinc-500"}
                >
                  {s.avgReturn !== null ? formatSignedPct(s.avgReturn) : "n/a"}
                </HighlightCell>
                <HighlightCell
                  isBest={bestTotalReturn !== null && s.totalReturn === bestTotalReturn}
                  className={s.totalReturn !== null ? toneTextClass(toneOf(s.totalReturn)) : "text-zinc-500"}
                >
                  {s.totalReturn !== null ? formatSignedPct(s.totalReturn, 1) : "n/a"}
                </HighlightCell>
                <HighlightCell
                  isBest={bestFinalValue !== null && s.finalValue === bestFinalValue}
                  className="text-zinc-300"
                >
                  {s.finalValue !== null
                    ? `$${s.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "n/a"}
                </HighlightCell>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
