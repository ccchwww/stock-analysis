// Rolling (trailing-window) versions of the static risk metrics in
// returns-math.ts -- same formulas, applied to a sliding window instead of
// the whole selected period, so the Risk Dashboard can show how risk
// evolves over time rather than one static number.

import { annualizedVolatility, sharpeRatio, computeBetaAlpha } from "./returns-math";

// Default trailing window, in trading days, for every rolling metric below.
// Shorter = more responsive to regime changes but noisier; longer = smoother
// but slower to react. 90 days (~4.5 trading months) is a middle ground.
export const ROLLING_WINDOW_DAYS = 90;

// Slides a trailing window of `windowSize` across `length` positions, calling
// `compute` with each window's [start, end) slice bounds once there's enough
// history to fill it. Positions before that are null -- there is no metric
// yet, not a metric of zero -- so callers/charts can render them as a gap.
function rollingSeries<T>(
  length: number,
  windowSize: number,
  compute: (start: number, end: number) => T | null,
): (T | null)[] {
  const out: (T | null)[] = [];
  for (let i = 0; i < length; i++) {
    out.push(i < windowSize - 1 ? null : compute(i - windowSize + 1, i + 1));
  }
  return out;
}

export function rollingVolatility(
  returns: (number | null)[],
  tradingDays = 252,
  windowSize = ROLLING_WINDOW_DAYS,
): (number | null)[] {
  return rollingSeries(returns.length, windowSize, (start, end) =>
    annualizedVolatility(returns.slice(start, end), tradingDays),
  );
}

export function rollingSharpe(
  returns: (number | null)[],
  riskFreeRateAnnual: number,
  tradingDays = 252,
  windowSize = ROLLING_WINDOW_DAYS,
): (number | null)[] {
  return rollingSeries(returns.length, windowSize, (start, end) =>
    sharpeRatio(returns.slice(start, end), riskFreeRateAnnual, tradingDays),
  );
}

// Beta only (not alpha) -- the risk-free rate cancels out of the beta
// calculation itself (it's just cov(stock, market) / var(market)), so it's
// passed as 0 here rather than threading the real rate through unused.
export function rollingBeta(
  returns: (number | null)[],
  marketReturns: (number | null)[],
  tradingDays = 252,
  windowSize = ROLLING_WINDOW_DAYS,
): (number | null)[] {
  return rollingSeries(returns.length, windowSize, (start, end) => {
    const betaAlpha = computeBetaAlpha(
      returns.slice(start, end),
      marketReturns.slice(start, end),
      0,
      tradingDays,
    );
    return betaAlpha?.beta ?? null;
  });
}
