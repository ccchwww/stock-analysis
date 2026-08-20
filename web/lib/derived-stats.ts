import type { EquityPoint } from "./types";
import { buildEquityCurveFromReturns, sampleForChart, periodStats } from "./equity-curve";
import { summarizeCurve } from "./performance";

export type DerivedStats = {
  id: string;
  label: string;
  description: string;
  upRate: number | null;
  avgReturn: number | null;
  numPeriods: number;
  totalReturn: number | null;
  finalValue: number | null;
  cagr: number | null;
  years: number | null;
  equityCurve: EquityPoint[]; // full precision, for stats
  chartCurve: EquityPoint[]; // downsampled, for the chart
};

// Turns ANY (already date-sliced) return series -- a strategy, a single
// stock, or an equal-weight portfolio blend -- into the full set of stats
// and curves the UI needs. One shared path for all three, so a start-date
// change recomputes everything identically regardless of what's selected.
export function computeDerivedStats(
  entry: { id: string; label: string; description?: string },
  slicedDates: string[],
  slicedReturns: (number | null)[],
  initialCapital: number,
): DerivedStats {
  const equityCurve = buildEquityCurveFromReturns(slicedDates, slicedReturns, initialCapital);
  const summary = summarizeCurve(equityCurve, initialCapital);
  const stats = periodStats(slicedReturns);

  return {
    id: entry.id,
    label: entry.label,
    description: entry.description ?? "",
    upRate: stats.upRate,
    avgReturn: stats.avgReturn,
    numPeriods: stats.numPeriods,
    totalReturn: summary?.totalReturn ?? null,
    finalValue: summary?.finalValue ?? null,
    cagr: summary?.cagr ?? null,
    years: summary?.years ?? null,
    equityCurve,
    chartCurve: sampleForChart(equityCurve),
  };
}
