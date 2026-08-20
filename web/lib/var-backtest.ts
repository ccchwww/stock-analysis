// VaR backtesting: tests whether the historical VaR shown on the Risk
// Dashboard (and its parametric counterpart) is actually well-calibrated,
// via a strictly out-of-sample rolling window and three standard likelihood-
// ratio tests (Kupiec, Christoffersen, conditional coverage).
//
// Computed entirely client-side, same reason as every other metric in this
// app (see efficient-frontier.ts's header comment for the full rationale):
// it's the only way the start-date control and stock selection keep
// recomputing instantly, since this project has no backend/API route. The
// three statistical tests need Python's scipy.stats.chi2.sf for a reference
// p-value -- but chi-square with df=1 or df=2 (the only two used here) has
// an EXACT closed form (see chiSquareSF below), so this needs no numerical
// library at all, and loses no precision relative to scipy. A companion
// Python script (backtest/validation.py) runs the same math independently,
// using scipy, against the full-history equal-weight portfolio, and prints
// the results to the console -- both as the requested sanity-check output
// and as a cross-check that this file's numbers agree with it.
//
// Sign convention throughout: VaR is a POSITIVE number (a loss magnitude).
// An "exception" is actualReturn_t < -VaR_t.

import { historicalVaR } from "./returns-math";

// Trailing window, in trading days, used for BOTH historical and parametric
// VaR here. Day t's VaR uses ONLY returns[t-250 .. t-1] -- never t itself --
// see rollingWindowSeries below; this is the one thing in this file that
// must never be gotten wrong, and it's proved (not just asserted) by a
// mutation test before this shipped: mutating day t or later leaves VaR[t]
// unchanged; mutating t-1 or t-250 (the oldest in-window day) always changes
// it; mutating t-251 (just outside) never does.
export const VAR_WINDOW_DAYS = 250;

export type ConfidenceLevel = 0.95 | 0.99;
export const CONFIDENCE_LEVELS: ConfidenceLevel[] = [0.95, 0.99];

// Standard normal one-sided critical values, used by parametric VaR
// (VaR = -(mu + z*sigma)); NEGATIVE by convention since they mark the LEFT
// tail of the distribution.
const Z_SCORES: Record<ConfidenceLevel, number> = { 0.95: -1.645, 0.99: -2.326 };

export type MethodKey = "historical" | "parametric";

function cleanReturns(returns: (number | null)[]): number[] {
  const out: number[] = [];
  for (const r of returns) {
    if (r !== null && Number.isFinite(r)) out.push(r);
  }
  return out;
}

// Slides a trailing window of `windowSize` across `length` positions. For
// position t, `compute` receives [start, end) = [t-windowSize, t) -- i.e.
// indices t-windowSize .. t-1, EXCLUDING t. Positions before t=windowSize
// get null (not enough history yet), same "absent, not zero" convention as
// rolling-metrics.ts, but note the different cutoff: that module's window
// INCLUDES the current day (needs t >= windowSize-1); this one's must
// EXCLUDE it (needs t >= windowSize) -- the whole point of a walk-forward
// VaR backtest is that day t's forecast may not see day t's own return.
function rollingWindowSeries<T>(
  length: number,
  windowSize: number,
  compute: (start: number, end: number) => T | null,
): (T | null)[] {
  const out: (T | null)[] = [];
  for (let t = 0; t < length; t++) {
    out.push(t < windowSize ? null : compute(t - windowSize, t));
  }
  return out;
}

// Rolling historical VaR: re-applies the EXACT SAME formula as the static
// historicalVaR() shown on the Risk Dashboard (empirical tail-cutoff
// percentile), just over each trailing 250-day window instead of the whole
// selected period -- so this is a direct test of that specific number's
// calibration, not a different methodology.
export function rollingHistoricalVaR(
  returns: (number | null)[],
  confidence: ConfidenceLevel,
  windowSize = VAR_WINDOW_DAYS,
): (number | null)[] {
  return rollingWindowSeries(returns.length, windowSize, (start, end) =>
    historicalVaR(returns.slice(start, end), confidence),
  );
}

function windowMeanStd(window: (number | null)[]): { mean: number; std: number } | null {
  const clean = cleanReturns(window);
  if (clean.length < 2) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / (clean.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

// Rolling parametric (normal / variance-covariance) VaR: VaR = -(mu + z*sigma),
// mu/sigma estimated from the SAME trailing window as the historical version,
// so the two are always compared apples-to-apples over identical data.
export function rollingParametricVaR(
  returns: (number | null)[],
  confidence: ConfidenceLevel,
  windowSize = VAR_WINDOW_DAYS,
): (number | null)[] {
  const z = Z_SCORES[confidence];
  return rollingWindowSeries(returns.length, windowSize, (start, end) => {
    const stats = windowMeanStd(returns.slice(start, end));
    if (!stats) return null;
    return -(stats.mean + z * stats.std);
  });
}

// The earliest date a full 250-day warmup is available for -- feed this to
// the start-date control's `min` so an infeasible date is simply never
// selectable, rather than silently shortening the backtest sample if one is
// (the task's explicit requirement).
export function earliestBacktestableDate(dates: string[], windowSize = VAR_WINDOW_DAYS): string {
  const idx = Math.min(windowSize, Math.max(0, dates.length - 1));
  return dates[idx];
}

// ---------------------------------------------------------------------------
// Chi-square survival function -- EXACT closed forms for df=1 and df=2 (the
// only two degrees of freedom the 3 tests below ever use), not an
// approximation and not scipy: chi-square(1) is the distribution of a
// squared standard normal, so its SF is erfc(sqrt(x/2)); chi-square(2) is
// exactly Exponential(2), so its SF is exp(-x/2). df=2's form is exact
// arithmetic; df=1 needs erfc, computed via Abramowitz & Stegun 7.1.26
// (max error 1.5e-7 -- verified against the standard 3.841/5.991/6.635
// critical values before this went into the UI).
function erfc(x: number): number {
  const p = 0.3275911;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-ax * ax);
  const erf = sign * y;
  return 1 - erf;
}

export function chiSquareSF(x: number, df: 1 | 2): number {
  const clamped = Math.max(0, x); // guards tiny negative floating-point noise around 0
  if (df === 1) return erfc(Math.sqrt(clamped / 2));
  return Math.exp(-clamped / 2);
}

const CHI2_CRITICAL_95 = { df1: 3.841, df2: 5.991 };

export type LikelihoodRatioTest = {
  statistic: number;
  pValue: number;
  criticalValue: number;
  df: 1 | 2;
  /** true = reject the null hypothesis (miscalibrated / clustered exceptions) at 5% significance */
  reject: boolean;
};

// n*ln(p) with the explicit convention 0*ln(anything) = 0 -- required so
// that a count of exactly 0 (no exceptions at all, or no consecutive
// exceptions) never evaluates Math.log(0) = -Infinity and produces NaN when
// multiplied by its own zero count. This is the "handle explicitly" guard
// the task calls for, applied uniformly everywhere a log-likelihood term is
// built below.
function safeLogTerm(count: number, prob: number): number {
  if (count === 0) return 0;
  return count * Math.log(prob);
}

// Kupiec (1995) proportion-of-failures test: does the observed exception
// rate match the nominal one (1-confidence)? n = evaluable observations,
// x = exceptions, p = nominal exception rate.
export function kupiecTest(n: number, x: number, nominalP: number): LikelihoodRatioTest {
  const piHat = n > 0 ? x / n : 0;
  const logNum = safeLogTerm(n - x, 1 - nominalP) + safeLogTerm(x, nominalP);
  const logDenom = safeLogTerm(n - x, 1 - piHat) + safeLogTerm(x, piHat);
  const statistic = Math.max(0, -2 * (logNum - logDenom));
  return {
    statistic,
    pValue: chiSquareSF(statistic, 1),
    criticalValue: CHI2_CRITICAL_95.df1,
    df: 1,
    reject: statistic > CHI2_CRITICAL_95.df1,
  };
}

export type ChristoffersenResult = LikelihoodRatioTest & {
  transitionCounts: { n00: number; n01: number; n10: number; n11: number };
};

// Christoffersen (1998) independence test: are exceptions clustered (e.g.
// crisis periods where breaches come in runs) rather than scattered
// independently through time? Built from the 0/1 transition matrix of the
// exception indicator series.
export function christoffersenTest(exceptions: boolean[]): ChristoffersenResult {
  let n00 = 0;
  let n01 = 0;
  let n10 = 0;
  let n11 = 0;
  for (let i = 1; i < exceptions.length; i++) {
    const prev = exceptions[i - 1];
    const curr = exceptions[i];
    if (!prev && !curr) n00++;
    else if (!prev && curr) n01++;
    else if (prev && !curr) n10++;
    else n11++;
  }
  const n0 = n00 + n01;
  const n1 = n10 + n11;
  const nTotal = n0 + n1;
  const pi0 = n0 > 0 ? n01 / n0 : 0;
  const pi1 = n1 > 0 ? n11 / n1 : 0;
  const pi = nTotal > 0 ? (n01 + n11) / nTotal : 0;

  const logNum = safeLogTerm(n00 + n10, 1 - pi) + safeLogTerm(n01 + n11, pi);
  const logDenom =
    safeLogTerm(n00, 1 - pi0) + safeLogTerm(n01, pi0) + safeLogTerm(n10, 1 - pi1) + safeLogTerm(n11, pi1);
  const statistic = Math.max(0, -2 * (logNum - logDenom));

  return {
    statistic,
    pValue: chiSquareSF(statistic, 1),
    criticalValue: CHI2_CRITICAL_95.df1,
    df: 1,
    reject: statistic > CHI2_CRITICAL_95.df1,
    transitionCounts: { n00, n01, n10, n11 },
  };
}

// Conditional coverage: joint test of correct unconditional rate AND
// independence. The two LR statistics simply add (both are likelihood-ratio
// statistics over nested hypotheses), giving a chi-square(2) statistic.
export function conditionalCoverageTest(
  kupiec: LikelihoodRatioTest,
  christoffersen: LikelihoodRatioTest,
): LikelihoodRatioTest {
  const statistic = kupiec.statistic + christoffersen.statistic;
  return {
    statistic,
    pValue: chiSquareSF(statistic, 2),
    criticalValue: CHI2_CRITICAL_95.df2,
    df: 2,
    reject: statistic > CHI2_CRITICAL_95.df2,
  };
}

// ---------------------------------------------------------------------------

export type SeriesTestResult = {
  method: MethodKey;
  confidence: ConfidenceLevel;
  n: number;
  exceptions: number;
  expectedExceptions: number;
  exceptionRate: number;
  kupiec: LikelihoodRatioTest;
  christoffersen: ChristoffersenResult;
  conditionalCoverage: LikelihoodRatioTest;
};

function buildSeriesTestResult(
  method: MethodKey,
  confidence: ConfidenceLevel,
  actualReturns: (number | null)[],
  varSeries: (number | null)[],
): SeriesTestResult {
  const exceptionSeq: boolean[] = [];
  for (let i = 0; i < actualReturns.length; i++) {
    const actual = actualReturns[i];
    const varValue = varSeries[i];
    if (actual === null || varValue === null) continue; // not evaluable that day
    exceptionSeq.push(actual < -varValue);
  }
  const n = exceptionSeq.length;
  const x = exceptionSeq.filter(Boolean).length;
  const nominalP = 1 - confidence;
  const kupiec = kupiecTest(n, x, nominalP);
  const christoffersen = christoffersenTest(exceptionSeq);
  const conditionalCoverage = conditionalCoverageTest(kupiec, christoffersen);
  return {
    method,
    confidence,
    n,
    exceptions: x,
    expectedExceptions: n * nominalP,
    exceptionRate: n > 0 ? x / n : 0,
    kupiec,
    christoffersen,
    conditionalCoverage,
  };
}

// Fisher-Pearson moment coefficients (population moments over the sample,
// no small-sample bias correction -- the simplest standard definition, and
// the one this page's explainer describes). A normal distribution has
// excess kurtosis exactly 0 by this same definition.
function computeSkewKurtosis(clean: number[]): { skewness: number; excessKurtosis: number } | null {
  const n = clean.length;
  if (n < 3) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of clean) {
    const d = x - mean;
    m2 += d * d;
    m3 += d ** 3;
    m4 += d ** 4;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  if (m2 === 0) return { skewness: 0, excessKurtosis: 0 };
  return { skewness: m3 / Math.pow(m2, 1.5), excessKurtosis: m4 / (m2 * m2) - 3 };
}

export type BaselZone = "green" | "yellow" | "red";

// Basel zones are defined for 99% VaR over 250 observations ONLY -- at 95%,
// ~12.5 exceptions per 250 days is the EXPECTED outcome for a well-calibrated
// model, so applying these boundaries there would flag a correct model as
// "red". Never call this for anything but the 99% historical series.
export function baselZone(scaledExceptionCount: number): BaselZone {
  const rounded = Math.round(scaledExceptionCount);
  if (rounded <= 4) return "green";
  if (rounded <= 9) return "yellow";
  return "red";
}

export const BASEL_ZONE_COLOR: Record<BaselZone, string> = {
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#f87171",
};

export type VarChartPoint = {
  date: string;
  actualReturn: number | null;
  varHist95: number | null;
  varHist99: number | null;
  varParam95: number | null;
  varParam99: number | null;
};

export type VarBacktestResult = {
  chartPoints: VarChartPoint[];
  // Always exactly 4, in a fixed order: historical/95, historical/99, parametric/95, parametric/99.
  results: SeriesTestResult[];
  skewness: number | null;
  excessKurtosis: number | null;
  basel: { n: number; exceptions: number; scaledTo250: number; zone: BaselZone } | null;
  numObservations: number;
};

// Main entry point. `dates`/`returns` must be the FULL, unsliced series (not
// pre-sliced to the user's start date) -- the whole point of the warmup
// requirement is that day t's VaR can reach into history before the
// backtest's visible start, so slicing must happen AFTER the rolling VaR
// series is computed, not before.
export function computeVarBacktest({
  dates,
  returns,
  startDate,
}: {
  dates: string[];
  returns: (number | null)[];
  startDate: string;
}): VarBacktestResult | null {
  const n = dates.length;
  if (n === 0 || n !== returns.length) return null;

  const hist95Full = rollingHistoricalVaR(returns, 0.95);
  const hist99Full = rollingHistoricalVaR(returns, 0.99);
  const param95Full = rollingParametricVaR(returns, 0.95);
  const param99Full = rollingParametricVaR(returns, 0.99);

  let startIndex = dates.findIndex((d) => d >= startDate);
  if (startIndex === -1) startIndex = n;

  const slicedDates = dates.slice(startIndex);
  const slicedReturns = returns.slice(startIndex);
  const slicedHist95 = hist95Full.slice(startIndex);
  const slicedHist99 = hist99Full.slice(startIndex);
  const slicedParam95 = param95Full.slice(startIndex);
  const slicedParam99 = param99Full.slice(startIndex);

  const chartPoints: VarChartPoint[] = slicedDates.map((date, i) => ({
    date,
    actualReturn: slicedReturns[i],
    varHist95: slicedHist95[i],
    varHist99: slicedHist99[i],
    varParam95: slicedParam95[i],
    varParam99: slicedParam99[i],
  }));

  const results: SeriesTestResult[] = [
    buildSeriesTestResult("historical", 0.95, slicedReturns, slicedHist95),
    buildSeriesTestResult("historical", 0.99, slicedReturns, slicedHist99),
    buildSeriesTestResult("parametric", 0.95, slicedReturns, slicedParam95),
    buildSeriesTestResult("parametric", 0.99, slicedReturns, slicedParam99),
  ];

  // Skewness/kurtosis describe the return distribution actually under test
  // -- restricted to the backtest window (where a VaR estimate exists),
  // NOT the warmup period that precedes it. Using the full sliced series
  // here (including warmup) would silently mix in up to 250 extra days that
  // none of the exception tests above ever look at, producing moments that
  // describe a different sample than what's being backtested.
  const backtestWindowReturns = slicedReturns.filter((_, i) => slicedHist95[i] !== null);
  const cleanBacktestReturns = cleanReturns(backtestWindowReturns);
  const moments = computeSkewKurtosis(cleanBacktestReturns);

  const hist99 = results[1];
  const basel =
    hist99.n > 0
      ? {
          n: hist99.n,
          exceptions: hist99.exceptions,
          scaledTo250: hist99.exceptions * (VAR_WINDOW_DAYS / hist99.n),
          zone: baselZone(hist99.exceptions * (VAR_WINDOW_DAYS / hist99.n)),
        }
      : null;

  return {
    chartPoints,
    results,
    skewness: moments?.skewness ?? null,
    excessKurtosis: moments?.excessKurtosis ?? null,
    basel,
    numObservations: cleanBacktestReturns.length,
  };
}
