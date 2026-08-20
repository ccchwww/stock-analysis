// Historical stress testing -- Model Validation tab, Part 2 of 3.
//
// Unlike Part 1 (VaR backtest) and the Risk Dashboard, this section's
// windows are FIXED historical dates (2008 GFC, 2014-16 oil crash, 2020
// COVID crash, 2022 rate hikes) -- NOT affected by the start-date control
// anywhere else on the site. It still reacts to stock SELECTION, since
// per-stock stats, the equal-weight blend, and the optimized portfolios are
// all over whichever stocks are currently selected.
//
// Computed client-side, same rationale as every other metric here: stock
// selection needs to recompute instantly, and this project has no backend.
// The data itself, though, comes from a SEPARATE long-history dataset
// (stress_data.json, ~2005-2022) rather than market_data.json's rolling
// 5-year window -- see backtest/stress_data.py.
//
// Look-ahead rule (the critical one): the minimum-variance and max-Sharpe
// portfolios reuse computeEfficientFrontier() from efficient-frontier.ts,
// but fed ONLY the 3 years of returns immediately BEFORE each window opens
// (window.lookbackStart .. window.start). Those weights are then held FIXED
// and applied to the window itself via combineWeighted() below -- never
// re-optimized using the window's own (future, from the estimate's point of
// view) data. If fewer than 2 selected tickers have sufficient lookback
// coverage (expected for the 2008 window, given today's TSX 60 didn't all
// exist in 2005), the optimized portfolios are reported as unavailable
// rather than silently falling back to a look-ahead-contaminated estimate.

import { maxDrawdown, annualizedVolatility, pearsonCorrelation, combineEqualWeight } from "./returns-math";
import { computeEfficientFrontier, type FrontierPoint } from "./efficient-frontier";

export type StressWindow = {
  key: string;
  label: string;
  start: string;
  end: string;
  lookbackStart: string;
};

export type WindowStats = {
  totalReturn: number;
  maxDrawdown: number;
  annualizedVolatility: number;
  worstDay: number;
  numObservations: number;
  coverageFraction: number; // fraction of the window's trading days with a valid return
};

export type TickerCoverage = {
  ticker: string;
  covered: boolean; // coverageFraction >= minCoverageFraction
  coverageFraction: number;
};

export type OptimizedPortfolioResult = {
  weights: Record<string, number> | null;
  qualifyingTickers: string[]; // subset of the selection with sufficient LOOKBACK coverage
  insufficientData: boolean; // true if fewer than 2 tickers qualified -- no weights computed
  stats: WindowStats | null;
};

export type CorrelationBreakdown = {
  baseline: number | null; // avg pairwise correlation, full sample EXCLUDING all 4 stress windows
  stress: number | null; // avg pairwise correlation, during this window only
  numPairsBaseline: number;
  numPairsStress: number;
};

export type StressWindowResult = {
  window: StressWindow;
  tickerCoverage: TickerCoverage[];
  perStock: Record<string, WindowStats | null>; // null = insufficient coverage, excluded
  equalWeight: WindowStats | null;
  benchmark: WindowStats | null;
  minVariance: OptimizedPortfolioResult;
  maxSharpe: OptimizedPortfolioResult;
  correlation: CorrelationBreakdown;
};

// Slices to [start, end] INCLUSIVE by date string comparison (ISO dates
// sort correctly as strings). Unlike sliceFromDate (date-range.ts), which
// slices from a start date to the END of the array, this also has an upper
// bound -- stress windows are closed intervals, not "from here onward".
// Used for the stress windows themselves (both endpoints are IN the window).
function sliceWindow(dates: string[], returns: (number | null)[], start: string, end: string): (number | null)[] {
  const startIdx = dates.findIndex((d) => d >= start);
  if (startIdx === -1) return [];
  let endIdx = -1;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= end) {
      endIdx = i;
      break;
    }
  }
  if (endIdx < startIdx) return [];
  return returns.slice(startIdx, endIdx + 1);
}

// Slices to [start, exclusiveEnd) -- exclusiveEnd itself is NOT included.
// This is what the lookback periods need: a lookback ending "at window.start"
// must stop the day BEFORE the window opens, never include window.start
// itself (that's the crisis window's own first day). Using sliceWindow's
// inclusive-end semantics here was a real bug caught by a mutation test
// before this shipped: mutating window.start's return changed the "outof-
// sample" weight estimate, which should be impossible by construction.
function sliceExclusiveEnd(
  dates: string[],
  returns: (number | null)[],
  start: string,
  exclusiveEnd: string,
): (number | null)[] {
  const startIdx = dates.findIndex((d) => d >= start);
  if (startIdx === -1) return [];
  let endIdx = dates.length;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] >= exclusiveEnd) {
      endIdx = i;
      break;
    }
  }
  if (endIdx <= startIdx) return [];
  return returns.slice(startIdx, endIdx);
}

function computeWindowStats(returns: (number | null)[], tradingDays: number): WindowStats | null {
  const clean: number[] = [];
  for (const r of returns) {
    if (r !== null && Number.isFinite(r)) clean.push(r);
  }
  if (clean.length === 0) return null;

  let compounded = 1;
  for (const r of clean) compounded *= 1 + r;

  return {
    totalReturn: compounded - 1,
    maxDrawdown: maxDrawdown(returns) ?? 0,
    annualizedVolatility: annualizedVolatility(returns, tradingDays) ?? 0,
    worstDay: Math.min(...clean),
    numObservations: clean.length,
    coverageFraction: returns.length > 0 ? clean.length / returns.length : 0,
  };
}

// Redistributes arbitrary (not necessarily equal) weights across whichever
// series have data on a given day -- the weighted counterpart to
// combineEqualWeight, needed to apply the optimizer's FIXED weights to the
// stress window's realized daily returns.
function combineWeighted(seriesList: (number | null)[][], weights: number[]): (number | null)[] {
  const length = seriesList[0]?.length ?? 0;
  const out: (number | null)[] = [];
  for (let i = 0; i < length; i++) {
    let sum = 0;
    let weightPresent = 0;
    for (let j = 0; j < seriesList.length; j++) {
      const r = seriesList[j][i];
      if (r !== null && Number.isFinite(r)) {
        sum += weights[j] * r;
        weightPresent += weights[j];
      }
    }
    out.push(weightPresent > 0 ? sum / weightPresent : null);
  }
  return out;
}

function coverageFractionOf(returns: (number | null)[]): number {
  if (returns.length === 0) return 0;
  const clean = returns.filter((r): r is number => r !== null && Number.isFinite(r));
  return clean.length / returns.length;
}

// exclusiveEnd=false (the window itself, both endpoints included) uses
// sliceWindow; exclusiveEnd=true (a lookback period) uses sliceExclusiveEnd
// so the lookback never reaches into the window it's meant to precede.
function tickerCoverageInRange(
  tickers: string[],
  dates: string[],
  returnsByTicker: Record<string, (number | null)[]>,
  start: string,
  end: string,
  minCoverageFraction: number,
  exclusiveEnd = false,
): TickerCoverage[] {
  return tickers.map((ticker) => {
    const sliced = exclusiveEnd
      ? sliceExclusiveEnd(dates, returnsByTicker[ticker] ?? [], start, end)
      : sliceWindow(dates, returnsByTicker[ticker] ?? [], start, end);
    const coverageFraction = coverageFractionOf(sliced);
    return { ticker, covered: coverageFraction >= minCoverageFraction, coverageFraction };
  });
}

function estimateOptimizedWeights({
  tickers,
  dates,
  returnsByTicker,
  lookbackStart,
  lookbackEnd,
  riskFreeRateAnnual,
  tradingDays,
  minCoverageFraction,
}: {
  tickers: string[];
  dates: string[];
  returnsByTicker: Record<string, (number | null)[]>;
  lookbackStart: string;
  lookbackEnd: string;
  riskFreeRateAnnual: number;
  tradingDays: number;
  minCoverageFraction: number;
}): { qualifyingTickers: string[]; minVariance: FrontierPoint | null; maxSharpe: FrontierPoint | null } {
  const coverage = tickerCoverageInRange(
    tickers,
    dates,
    returnsByTicker,
    lookbackStart,
    lookbackEnd,
    minCoverageFraction,
    /* exclusiveEnd */ true,
  );
  const qualifyingTickers = coverage.filter((c) => c.covered).map((c) => c.ticker);

  if (qualifyingTickers.length < 2) {
    return { qualifyingTickers, minVariance: null, maxSharpe: null };
  }

  const lookbackReturnsByTicker: Record<string, (number | null)[]> = {};
  for (const ticker of qualifyingTickers) {
    lookbackReturnsByTicker[ticker] = sliceExclusiveEnd(dates, returnsByTicker[ticker] ?? [], lookbackStart, lookbackEnd);
  }

  const frontier = computeEfficientFrontier({
    tickers: qualifyingTickers,
    returnsByTicker: lookbackReturnsByTicker,
    riskFreeRateAnnual,
    tradingDays,
  });

  if (!frontier) return { qualifyingTickers, minVariance: null, maxSharpe: null };
  return { qualifyingTickers, minVariance: frontier.minVariance, maxSharpe: frontier.maxSharpe };
}

function buildOptimizedResult(
  point: FrontierPoint | null,
  qualifyingTickers: string[],
  dates: string[],
  returnsByTicker: Record<string, (number | null)[]>,
  windowStart: string,
  windowEnd: string,
  tradingDays: number,
): OptimizedPortfolioResult {
  if (!point) {
    return { weights: null, qualifyingTickers, insufficientData: true, stats: null };
  }
  const weights: Record<string, number> = {};
  qualifyingTickers.forEach((ticker, i) => {
    weights[ticker] = point.weights[i];
  });
  const windowSeries = qualifyingTickers.map((ticker) => sliceWindow(dates, returnsByTicker[ticker] ?? [], windowStart, windowEnd));
  const blended = combineWeighted(windowSeries, point.weights);
  const stats = computeWindowStats(blended, tradingDays);
  return { weights, qualifyingTickers, insufficientData: false, stats };
}

function filterByDatePredicate(
  dates: string[],
  returns: (number | null)[],
  predicate: (date: string) => boolean,
): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (predicate(dates[i])) out.push(returns[i]);
  }
  return out;
}

function averagePairwiseCorrelation(
  tickers: string[],
  dates: string[],
  returnsByTicker: Record<string, (number | null)[]>,
  predicate: (date: string) => boolean,
): { value: number | null; numPairs: number } {
  if (tickers.length < 2) return { value: null, numPairs: 0 };
  const filtered: Record<string, (number | null)[]> = {};
  for (const ticker of tickers) {
    filtered[ticker] = filterByDatePredicate(dates, returnsByTicker[ticker] ?? [], predicate);
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const corr = pearsonCorrelation(filtered[tickers[i]], filtered[tickers[j]]);
      if (corr !== null) {
        sum += corr;
        count++;
      }
    }
  }
  return { value: count > 0 ? sum / count : null, numPairs: count };
}

export function computeStressTestResults({
  windows,
  tickers,
  dates,
  returnsByTicker,
  benchmarkReturns,
  riskFreeRateAnnual,
  tradingDays,
  minCoverageFraction,
}: {
  windows: StressWindow[];
  tickers: string[];
  dates: string[];
  returnsByTicker: Record<string, (number | null)[]>;
  benchmarkReturns: (number | null)[];
  riskFreeRateAnnual: number;
  tradingDays: number;
  minCoverageFraction: number;
}): StressWindowResult[] {
  // Baseline correlation is the SAME reference for every window (full
  // sample excluding ALL 4 stress windows), so compute it once.
  const isInAnyWindow = (date: string) => windows.some((w) => date >= w.start && date <= w.end);
  const baseline = averagePairwiseCorrelation(tickers, dates, returnsByTicker, (date) => !isInAnyWindow(date));

  return windows.map((window) => {
    const coverage = tickerCoverageInRange(tickers, dates, returnsByTicker, window.start, window.end, minCoverageFraction);

    const perStock: Record<string, WindowStats | null> = {};
    for (const ticker of tickers) {
      const isCovered = coverage.find((c) => c.ticker === ticker)?.covered ?? false;
      const stats = isCovered ? computeWindowStats(sliceWindow(dates, returnsByTicker[ticker] ?? [], window.start, window.end), tradingDays) : null;
      perStock[ticker] = stats;
    }

    const coveredTickers = coverage.filter((c) => c.covered).map((c) => c.ticker);
    const equalWeight =
      coveredTickers.length > 0
        ? computeWindowStats(
            combineEqualWeight(
              coveredTickers.map((ticker) => ({
                id: ticker,
                returns: sliceWindow(dates, returnsByTicker[ticker] ?? [], window.start, window.end),
              })),
            ),
            tradingDays,
          )
        : null;

    const benchmark = computeWindowStats(sliceWindow(dates, benchmarkReturns, window.start, window.end), tradingDays);

    const { qualifyingTickers, minVariance: minVarPoint, maxSharpe: maxSharpePoint } = estimateOptimizedWeights({
      tickers,
      dates,
      returnsByTicker,
      lookbackStart: window.lookbackStart,
      lookbackEnd: window.start,
      riskFreeRateAnnual,
      tradingDays,
      minCoverageFraction,
    });

    const minVariance = buildOptimizedResult(minVarPoint, qualifyingTickers, dates, returnsByTicker, window.start, window.end, tradingDays);
    const maxSharpe = buildOptimizedResult(maxSharpePoint, qualifyingTickers, dates, returnsByTicker, window.start, window.end, tradingDays);

    const stress = averagePairwiseCorrelation(tickers, dates, returnsByTicker, (date) => date >= window.start && date <= window.end);

    return {
      window,
      tickerCoverage: coverage,
      perStock,
      equalWeight,
      benchmark,
      minVariance,
      maxSharpe,
      correlation: {
        baseline: baseline.value,
        stress: stress.value,
        numPairsBaseline: baseline.numPairs,
        numPairsStress: stress.numPairs,
      },
    };
  });
}
