import type { EquityPoint } from "./types";

// Compounds a daily return series (already sliced to the user's chosen start
// date) into a $-value equity curve. dates[0] is the anchor -- "$initialCapital
// on the chosen start date" -- and is NOT itself compounded; returns[0] (the
// return realized on that date relative to whatever came before the user's
// window) is intentionally skipped. Compounding starts from dates[1] onward.
// A null return mid-series (e.g. a strategy still in its warm-up period, or
// a stock with a data gap) is treated as a flat 0% day, so the curve stays
// continuous.
export function buildEquityCurveFromReturns(
  dates: string[],
  returns: (number | null)[],
  initialCapital: number,
): EquityPoint[] {
  if (dates.length === 0) return [];

  const curve: EquityPoint[] = [{ date: dates[0], value: initialCapital }];
  let value = initialCapital;
  for (let i = 1; i < dates.length; i++) {
    value *= 1 + (returns[i] ?? 0);
    curve.push({ date: dates[i], value: Math.round(value * 100) / 100 });
  }
  return curve;
}

// Downsamples a curve for charting so a 5-year daily series doesn't push
// thousands of points into Recharts; always keeps the first and last point.
// The step adapts to the curve's length so a short (e.g. 3-month) window
// still renders with plenty of detail instead of the fixed weekly step
// this project used before start dates were selectable.
export function sampleForChart(curve: EquityPoint[], targetPoints = 180): EquityPoint[] {
  if (curve.length <= targetPoints) return curve;
  const step = Math.ceil(curve.length / targetPoints);
  const sampled = curve.filter((_, i) => i % step === 0);
  const last = curve[curve.length - 1];
  if (sampled[sampled.length - 1]?.date !== last.date) sampled.push(last);
  return sampled;
}

// Up-rate / average return over the raw daily return series -- the fraction
// of days with a positive return and their mean. (For 12-Month Momentum this
// is now measured per DAY rather than per rebalance-month, unlike the
// original single-window backtest -- a deliberate simplification so every
// strategy and stock shares one recompute path for any start date; it's a
// still-honest statistic, just "how often was a trading day positive" rather
// than "how often was a rebalance period positive".)
export function periodStats(
  returns: (number | null)[],
): { upRate: number | null; avgReturn: number | null; numPeriods: number } {
  const clean = returns.filter((r): r is number => r !== null && Number.isFinite(r));
  if (clean.length === 0) return { upRate: null, avgReturn: null, numPeriods: 0 };
  const upRate = clean.filter((r) => r > 0).length / clean.length;
  const avgReturn = clean.reduce((a, b) => a + b, 0) / clean.length;
  return { upRate, avgReturn, numPeriods: clean.length };
}
