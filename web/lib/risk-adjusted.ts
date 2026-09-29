import type { DerivedStats } from "./derived-stats";
import { annualizedVolatility, maxDrawdown, sharpeRatio } from "./returns-math";

// Risk-adjusted view of the Strategies tab: the same rows as the comparison
// table, scored on the metrics that say whether a return was worth the risk
// taken to get it. Every number here comes from an existing shared function
// (lib/returns-math.ts for volatility/Sharpe/drawdown, lib/performance.ts's
// CAGR via DerivedStats) rather than a second implementation, so a strategy's
// Sharpe here and a stock's Sharpe on the Risk Dashboard are the same
// calculation with the same conventions.

export type PerformanceRowKind = "strategy" | "benchmark";

/** One plottable, scorable line: an active strategy, Buy & Hold, or a passive
 *  index benchmark. Everything downstream works off this shape so a benchmark
 *  cannot accidentally be scored differently from a strategy. */
export type PerformanceRow = {
  id: string;
  label: string;
  description: string;
  kind: PerformanceRowKind;
  color: string;
  /** SVG stroke-dasharray; undefined means a solid line. */
  dash?: string;
  stats: DerivedStats;
  /** Sliced to the selected start date, same window as `stats`. */
  slicedReturns: (number | null)[];
  /** Sliced turnover, or null for a passive benchmark -- a benchmark has no
   *  strategy turnover to report, and reporting 0 would imply we had measured
   *  the fund's internal trading, which we have not. */
  slicedTurnover: (number | null)[] | null;
};

export type RiskAdjustedRow = {
  id: string;
  label: string;
  kind: PerformanceRowKind;
  cagr: number | null;
  volatility: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  /** Portfolio turnover per year: total fraction traded over the window
   *  divided by the window's length in years. null for passive benchmarks. */
  annualizedTurnover: number | null;
};

export function computeRiskAdjustedRow(
  row: PerformanceRow,
  riskFreeRateAnnual: number,
  tradingDays: number,
): RiskAdjustedRow {
  let annualizedTurnover: number | null = null;
  if (row.slicedTurnover && row.stats.years !== null && row.stats.years > 0) {
    let traded = 0;
    for (const t of row.slicedTurnover) {
      if (t !== null && Number.isFinite(t)) traded += t;
    }
    annualizedTurnover = traded / row.stats.years;
  }

  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    cagr: row.stats.cagr,
    volatility: annualizedVolatility(row.slicedReturns, tradingDays),
    sharpe: sharpeRatio(row.slicedReturns, riskFreeRateAnnual, tradingDays),
    maxDrawdown: maxDrawdown(row.slicedReturns),
    annualizedTurnover,
  };
}

/** One plain-language line per column, rendered under the table rather than
 *  hidden in a tooltip -- a hover-only explanation is no explanation on a
 *  phone. */
export function metricExplainers(
  riskFreeRateAnnual: number,
  tradingDays: number,
): Array<{ term: string; definition: string }> {
  const rfPct = `${(riskFreeRateAnnual * 100).toFixed(2)}%`;
  return [
    {
      term: "CAGR",
      definition:
        "The steady yearly growth rate that would compound to the same final value — what the return works out to per year, not the total added up.",
    },
    {
      term: "Volatility",
      definition: `How much the daily return bounces around, scaled to a year (standard deviation × √${tradingDays}). Higher means a rougher ride, in both directions.`,
    },
    {
      term: "Sharpe",
      definition: `Return earned per unit of volatility, after subtracting the ${rfPct} risk-free rate. Higher is better; below zero means cash would have done more with less risk.`,
    },
    {
      term: "Max drawdown",
      definition:
        "The worst peak-to-trough fall inside the window — how far the account was down from its own high-water mark at the lowest point.",
    },
    {
      term: "Turnover / yr",
      definition:
        "How much of the portfolio is bought and sold per year. 1.0× means it replaces itself about once a year; 380× means the whole basket is swapped nearly every trading day.",
    },
  ];
}
