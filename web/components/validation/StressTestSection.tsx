"use client";

import { useMemo } from "react";
import type { StressMeta } from "@/lib/validation-types";
import { computeStressTestResults, type StressWindow } from "@/lib/stress-test";
import { formatSignedPct } from "@/lib/format";
import StressWindowCard from "./StressWindowCard";

export default function StressTestSection({
  tickers,
  names,
  dates,
  returnsByTicker,
  benchmarkReturns,
  stressConfig,
  riskFreeRateAnnual,
  tradingDays,
}: {
  tickers: string[];
  names: Record<string, string>;
  dates: string[];
  returnsByTicker: Record<string, (number | null)[]>;
  benchmarkReturns: (number | null)[];
  stressConfig: StressMeta;
  riskFreeRateAnnual: number;
  tradingDays: number;
}) {
  const windows: StressWindow[] = useMemo(
    () =>
      stressConfig.windows.map((w) => ({
        key: w.key,
        label: w.label,
        start: w.start,
        end: w.end,
        lookbackStart: w.lookback_start,
      })),
    [stressConfig.windows],
  );

  const results = useMemo(() => {
    if (tickers.length === 0) return [];
    return computeStressTestResults({
      windows,
      tickers,
      dates,
      returnsByTicker,
      benchmarkReturns,
      riskFreeRateAnnual,
      tradingDays,
      minCoverageFraction: stressConfig.min_coverage_fraction,
    });
  }, [windows, tickers, dates, returnsByTicker, benchmarkReturns, riskFreeRateAnnual, tradingDays, stressConfig.min_coverage_fraction]);

  // Computed from whatever's currently selected, not hardcoded -- this is
  // the section's headline finding IF it shows up, reported honestly either
  // way (see the task's own instruction not to force the narrative).
  const underperformances = results.filter(
    (r) => r.maxSharpe.stats && r.equalWeight && r.maxSharpe.stats.totalReturn < r.equalWeight.totalReturn,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Historical Stress Testing</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          How the currently selected stocks — individually, equal-weighted, against the benchmark, and via the
          Efficient Frontier&rsquo;s minimum-variance and maximum-Sharpe portfolios — actually performed
          through four real historical crises. {stressConfig.fixed_window_note}
        </p>
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Look-ahead rule</p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{stressConfig.lookahead_note}</p>
        </div>
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Survivorship bias, worse here</p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{stressConfig.survivorship_note}</p>
        </div>
      </div>

      {tickers.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-zinc-500">Select one or more stocks above to run the stress tests.</p>
        </div>
      ) : (
        <>
          <div className={`rounded-lg border p-4 ${underperformances.length > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-surface"}`}>
            <h3 className="text-sm font-semibold text-foreground">
              {underperformances.length > 0 ? "Max-Sharpe underperformed equal-weight" : "Max-Sharpe held up against equal-weight"}
            </h3>
            {underperformances.length > 0 ? (
              <>
                <p className="mt-1.5 text-sm text-red-400">
                  In {underperformances.length} of {results.length} crises for the current selection, the
                  max-Sharpe (tangency) portfolio did WORSE than simply equal-weighting the same stocks:
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-400">
                  {underperformances.map((r) => (
                    <li key={r.window.key}>
                      <span className="text-zinc-300">{r.window.label}:</span> max-Sharpe{" "}
                      {formatSignedPct(r.maxSharpe.stats!.totalReturn, 1)} vs equal-weight{" "}
                      {formatSignedPct(r.equalWeight!.totalReturn, 1)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  This is exactly the instability caveat already stated on the Efficient Frontier page: weights
                  estimated from calm-period historical data can concentrate into names that turn out to be
                  more correlated (Canadian banks especially) than the pre-crisis estimate suggested, and that
                  concentration can backfire precisely when diversification would have helped most.
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                For the current selection, max-Sharpe did not underperform equal-weight in any of these{" "}
                {results.length} crises — reported honestly rather than forcing the instability narrative; try
                a different combination of stocks (concentrated bank selections tend to show it more clearly)
                to explore further.
              </p>
            )}
          </div>

          {results.map((r) => (
            <StressWindowCard key={r.window.key} result={r} names={names} />
          ))}

          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-foreground">Correlation Breakdown in Crises</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{stressConfig.correlation_baseline_note}</p>
          </div>
        </>
      )}
    </div>
  );
}
