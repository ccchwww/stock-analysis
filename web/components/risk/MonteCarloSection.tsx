"use client";

import { useMemo, useState } from "react";
import { estimatePortfolioMoments, runMonteCarlo, buildHistogram } from "@/lib/monte-carlo";
import StatCard from "@/components/shared/StatCard";
import MonteCarloHistogram from "./MonteCarloHistogram";

const HORIZON_PRESETS = [
  { label: "3 Months", days: 63 },
  { label: "6 Months", days: 126 },
  { label: "1 Year", days: 252 },
  { label: "3 Years", days: 756 },
  { label: "5 Years", days: 1260 },
];

// 10,000 paths, chosen from the task's suggested 5,000-10,000 range: the
// portfolio-variance simplification above (see lib/monte-carlo.ts) makes the
// simulation O(numPaths * horizonDays) regardless of how many stocks are
// blended, so 10k paths x a 5-year horizon still runs client-side in well
// under a second -- no need to drop to a smaller path count or move this to
// Python.
const NUM_PATHS = 10_000;

function formatDollars(value: number): string {
  return `$${Math.round(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function MonteCarloSection({
  targetLabel,
  seriesList,
  weights,
}: {
  targetLabel: string;
  seriesList: (number | null)[][];
  weights: number[];
}) {
  const [amount, setAmount] = useState(10_000);
  const [horizonDays, setHorizonDays] = useState(252);

  const moments = useMemo(
    () => estimatePortfolioMoments(seriesList, weights),
    [seriesList, weights],
  );

  const result = useMemo(() => {
    if (!moments || amount <= 0) return null;
    return runMonteCarlo({
      dailyMean: moments.dailyMean,
      dailyVol: moments.dailyVol,
      horizonDays,
      initialAmount: amount,
      numPaths: NUM_PATHS,
    });
  }, [moments, horizonDays, amount]);

  const histogram = useMemo(
    () => (result ? buildHistogram(result.finalValues, 32) : []),
    [result],
  );

  const horizonLabel =
    HORIZON_PRESETS.find((h) => h.days === horizonDays)?.label ??
    `${(horizonDays / 252).toFixed(1)} years`;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Expected Outcome (Monte Carlo)</h2>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">
        Simulates {NUM_PATHS.toLocaleString()} random paths of compounding
        daily returns, drawn from {targetLabel}&rsquo;s historical mean and
        volatility over the selected window, then reads percentiles off the
        resulting distribution of outcomes — not a symmetric band around the
        average.
      </p>

      <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Investment Amount
          </label>
          <div className="flex min-h-[42px] items-center gap-1 rounded-lg border border-border bg-background/40 px-3 py-2">
            <span className="text-sm text-zinc-500">$</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              className="w-32 bg-transparent text-sm text-zinc-200 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Horizon
          </label>
          <div className="flex flex-wrap gap-1.5">
            {HORIZON_PRESETS.map((h) => (
              <button
                key={h.days}
                type="button"
                onClick={() => setHorizonDays(h.days)}
                aria-pressed={horizonDays === h.days}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  horizonDays === h.days
                    ? "border-zinc-600 bg-background text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!result ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          Not enough historical data in this window to run a simulation.
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm leading-relaxed text-zinc-300">
            Invest <span className="font-mono font-semibold text-foreground">{formatDollars(amount)}</span> in{" "}
            <span className="font-medium text-foreground">{targetLabel}</span> → in{" "}
            {horizonLabel.toLowerCase()}, the median outcome is{" "}
            <span className="font-mono font-semibold text-emerald-400">
              ~{formatDollars(result.median)}
            </span>
            , and 90% of simulated outcomes fall between{" "}
            <span className="font-mono font-semibold text-zinc-100">{formatDollars(result.p5)}</span> and{" "}
            <span className="font-mono font-semibold text-zinc-100">{formatDollars(result.p95)}</span>.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Median Outcome"
              value={formatDollars(result.median)}
              tone="positive"
              caption={`after ${horizonLabel.toLowerCase()}`}
            />
            <StatCard
              label="5th Percentile"
              value={formatDollars(result.p5)}
              caption="downside — 5% of paths land below this"
            />
            <StatCard
              label="95th Percentile"
              value={formatDollars(result.p95)}
              tone="positive"
              caption="upside — 5% of paths land above this"
            />
            <StatCard
              label="Probability of Loss"
              value={`${(result.probabilityOfLoss * 100).toFixed(0)}%`}
              tone={result.probabilityOfLoss > 0.5 ? "negative" : "neutral"}
              caption="share of paths ending below your initial amount"
            />
          </div>

          <MonteCarloHistogram bins={histogram} initialAmount={amount} />

          <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-zinc-500">
            Assumes future daily returns are drawn from the SAME distribution
            (mean, volatility, and — for a multi-stock portfolio — covariance)
            as the historical window selected above; past performance never
            guarantees future results. Ignores regime changes, assumes no
            autocorrelation between days, and can&rsquo;t foresee events outside
            the historical sample. {NUM_PATHS.toLocaleString()} simulated
            paths, computed client-side.
          </p>
        </>
      )}
    </div>
  );
}
