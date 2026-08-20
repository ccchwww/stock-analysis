// Monte Carlo projection of a future investment outcome, driven by the
// historical daily mean/volatility (and, for a multi-stock portfolio, the
// full covariance matrix) of the currently-selected stock(s).
//
// Design note on the portfolio case: rather than simulating each underlying
// stock's correlated daily path via Cholesky decomposition and then
// aggregating to the equal-weight portfolio value (O(numStocks^2) work per
// day per path), we use the standard portfolio-variance identity instead:
// for an equal-weight combination with weights w and covariance matrix Sigma,
// the portfolio's own daily variance is the quadratic form w^T Sigma w. That
// scalar already fully reflects the diversification benefit (or lack of it)
// from how correlated the picks are -- it IS "using the covariance so
// correlations are respected" -- so we can simulate the PORTFOLIO's daily
// return directly as a univariate N(mu_p, portfolioVol^2) process. This is
// mathematically equivalent for everything we report (percentiles of final
// portfolio value, since we never need each individual stock's simulated
// path) and is O(numPaths * horizonDays) instead of O(numPaths * horizonDays
// * numStocks^2) -- comfortably fast client-side even at 10,000 paths.
//
// The right-skew the task asks for falls out naturally from compounding: we
// simulate day-by-day and multiply, we never compute a single-step Gaussian
// interval around the mean, so the distribution of final values is the
// product of many (1 + r) factors -- right-skewed like a log-normal, capped
// below by (near) zero, never symmetric.

import { computeMeanCovariance } from "./returns-math";

export type PortfolioMoments = {
  dailyMean: number;
  dailyVol: number;
  numObservations: number;
};

// Estimates the portfolio's own daily mean and volatility by combining a
// listwise-complete mean vector + covariance matrix (see
// computeMeanCovariance in returns-math.ts, shared with the Efficient
// Frontier optimizer) via the standard portfolio-variance identity, w^T Sigma w.
export function estimatePortfolioMoments(
  seriesList: (number | null)[][],
  weights: number[],
): PortfolioMoments | null {
  if (weights.length !== seriesList.length) return null;
  const moments = computeMeanCovariance(seriesList);
  if (!moments) return null;
  const { mean, cov, numObservations } = moments;

  let dailyMean = 0;
  for (let j = 0; j < weights.length; j++) dailyMean += weights[j] * mean[j];

  let variance = 0;
  for (let a = 0; a < weights.length; a++) {
    for (let b = 0; b < weights.length; b++) variance += weights[a] * weights[b] * cov[a][b];
  }

  return {
    dailyMean,
    dailyVol: Math.sqrt(Math.max(0, variance)),
    numObservations,
  };
}

// Standard normal sampler via Box-Muller, caching the spare value from each
// pair of uniforms so it costs ~1 trig call per draw instead of 2.
function makeGaussianSampler() {
  let spare: number | null = null;
  return function next(): number {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const radius = Math.sqrt(-2 * Math.log(u));
    const angle = 2 * Math.PI * v;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

export type MonteCarloResult = {
  finalValues: number[]; // sorted ascending
  median: number;
  p5: number;
  p95: number;
  probabilityOfLoss: number; // fraction of paths ending below the initial amount
  numPaths: number;
  horizonDays: number;
};

// Simulates `numPaths` independent trajectories of `horizonDays` compounding
// daily returns drawn from N(dailyMean, dailyVol^2), each day's multiplier
// floored just above zero (a real position can't lose more than 100% in a
// day, but an unclamped Gaussian tail technically can imply that).
export function runMonteCarlo({
  dailyMean,
  dailyVol,
  horizonDays,
  initialAmount,
  numPaths = 10_000,
}: {
  dailyMean: number;
  dailyVol: number;
  horizonDays: number;
  initialAmount: number;
  numPaths?: number;
}): MonteCarloResult {
  const gaussian = makeGaussianSampler();
  const finalValues = new Array<number>(numPaths);

  for (let p = 0; p < numPaths; p++) {
    let multiplier = 1;
    for (let d = 0; d < horizonDays; d++) {
      const dailyReturn = dailyMean + dailyVol * gaussian();
      multiplier *= Math.max(1 + dailyReturn, 1e-6);
    }
    finalValues[p] = multiplier * initialAmount;
  }

  finalValues.sort((a, b) => a - b);

  return {
    finalValues,
    median: percentile(finalValues, 0.5),
    p5: percentile(finalValues, 0.05),
    p95: percentile(finalValues, 0.95),
    probabilityOfLoss: finalValues.filter((v) => v < initialAmount).length / finalValues.length,
    numPaths,
    horizonDays,
  };
}

// Linear-interpolated percentile of an already-sorted array.
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return NaN;
  const index = p * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export type HistogramBin = {
  binStart: number;
  binEnd: number;
  count: number;
};

export function buildHistogram(sortedValues: number[], numBins = 30): HistogramBin[] {
  if (sortedValues.length === 0) return [];
  const min = sortedValues[0];
  const max = sortedValues[sortedValues.length - 1];
  if (max === min) return [{ binStart: min, binEnd: max, count: sortedValues.length }];

  const width = (max - min) / numBins;
  const bins: HistogramBin[] = Array.from({ length: numBins }, (_, i) => ({
    binStart: min + i * width,
    binEnd: min + (i + 1) * width,
    count: 0,
  }));

  for (const value of sortedValues) {
    const idx = Math.min(numBins - 1, Math.floor((value - min) / width));
    bins[idx].count += 1;
  }

  return bins;
}
