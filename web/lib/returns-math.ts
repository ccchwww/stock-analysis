// Pure numeric functions over daily-return arrays, shared by the Strategies
// tab and the Risk Dashboard -- both work from the same "returns aligned to
// a dates array" shape (market_data.json's stocks, results.json's
// strategies), computed client-side so they react instantly to the user's
// stock selection and chosen start date.
//
// All functions treat `null` entries as "no data that day" and simply skip
// them -- they are NOT treated as a 0% return, since that would understate
// volatility and distort correlations for tickers with gaps.

export type ReturnSeries = {
  id: string;
  returns: (number | null)[];
};

function cleanReturns(returns: (number | null)[]): number[] {
  const out: number[] = [];
  for (const r of returns) {
    if (r !== null && Number.isFinite(r)) out.push(r);
  }
  return out;
}

// Equal-weight blend of multiple daily return series into one, redistributing
// weight across whichever series have data on a given day. Used by both tabs
// to build a portfolio's own return series before deriving equity curves or
// risk metrics from it.
export function combineEqualWeight(series: ReturnSeries[]): (number | null)[] {
  if (series.length === 0) return [];
  const length = series[0].returns.length;
  const weight = 1 / series.length;
  const out: (number | null)[] = [];

  for (let i = 0; i < length; i++) {
    let sum = 0;
    let weightPresent = 0;
    for (const s of series) {
      const r = s.returns[i];
      if (r !== null && Number.isFinite(r)) {
        sum += weight * r;
        weightPresent += weight;
      }
    }
    out.push(weightPresent > 0 ? sum / weightPresent : null);
  }

  return out;
}

// Standard deviation of daily returns, annualized by sqrt(tradingDays) --
// the usual convention because variance scales linearly with time for
// (approximately) independent daily returns, so std scales with its square root.
export function annualizedVolatility(
  returns: (number | null)[],
  tradingDays = 252,
): number | null {
  const clean = cleanReturns(returns);
  if (clean.length < 2) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const variance =
    clean.reduce((a, b) => a + (b - mean) ** 2, 0) / (clean.length - 1);
  return Math.sqrt(variance) * Math.sqrt(tradingDays);
}

// Sharpe ratio: annualized excess return over annualized volatility.
// Mean daily return and volatility are each annualized independently, then
// the (already-annual) risk-free rate is subtracted -- the standard
// textbook form, not a precise treatment of compounding.
export function sharpeRatio(
  returns: (number | null)[],
  riskFreeRateAnnual: number,
  tradingDays = 252,
): number | null {
  const clean = cleanReturns(returns);
  if (clean.length < 2) return null;
  const meanDaily = clean.reduce((a, b) => a + b, 0) / clean.length;
  const annualizedReturn = meanDaily * tradingDays;
  const vol = annualizedVolatility(returns, tradingDays);
  if (!vol) return null;
  return (annualizedReturn - riskFreeRateAnnual) / vol;
}

// Maximum drawdown: the worst peak-to-trough decline in the compounded
// growth-of-$1 curve over the window. Returned as a negative fraction
// (e.g. -0.32 = a 32% decline from peak).
export function maxDrawdown(returns: (number | null)[]): number | null {
  const clean = cleanReturns(returns);
  if (clean.length === 0) return null;

  let value = 1;
  let peak = 1;
  let worst = 0;
  for (const r of clean) {
    value *= 1 + r;
    if (value > peak) peak = value;
    const drawdown = value / peak - 1;
    if (drawdown < worst) worst = drawdown;
  }
  return worst;
}

// Shared tail cutoff for VaR and Expected Shortfall, so the two always agree
// on exactly which days count as "the worst (1 - confidence) share" -- ES is
// only a meaningful companion to VaR if they're measuring the same tail.
function tailCutoffIndex(sortedAscending: number[], confidence: number): number {
  const alpha = 1 - confidence;
  return Math.min(
    sortedAscending.length - 1,
    Math.max(0, Math.floor(alpha * sortedAscending.length)),
  );
}

// Historical (empirical) 1-day Value at Risk: sorts actual daily returns and
// reads off the (1 - confidence) percentile -- no distributional assumption,
// unlike parametric VaR. Returned as a POSITIVE fraction representing the
// loss magnitude (e.g. 0.023 = "a 2.3% one-day loss at this confidence
// level"). Says nothing about how bad the losses beyond that threshold could
// be -- that's what Expected Shortfall (Conditional VaR) measures instead.
export function historicalVaR(
  returns: (number | null)[],
  confidence = 0.95,
): number | null {
  const clean = cleanReturns(returns).slice().sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const index = tailCutoffIndex(clean, confidence);
  return -clean[index];
}

// Historical (empirical) 1-day Expected Shortfall, a.k.a. Conditional VaR:
// the average of the worst (1 - confidence) share of daily returns, i.e. the
// mean loss ON the days at or beyond the VaR threshold -- the severity VaR
// itself doesn't capture. Uses the identical tail cutoff as historicalVaR
// above so the two are always measuring the same set of worst days.
// Returned as a positive loss magnitude, same convention as VaR; because it
// averages the tail rather than reading its boundary, |ES| >= |VaR| always
// (with equality only in the degenerate case of a single-day tail).
export function historicalExpectedShortfall(
  returns: (number | null)[],
  confidence = 0.95,
): number | null {
  const clean = cleanReturns(returns).slice().sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const index = tailCutoffIndex(clean, confidence);
  const tail = clean.slice(0, index + 1);
  const tailMean = tail.reduce((a, b) => a + b, 0) / tail.length;
  return -tailMean;
}

// Pearson correlation between two return series, using only the days both
// have data (pairwise-complete, not listwise across the whole selection).
export function pearsonCorrelation(
  a: (number | null)[],
  b: (number | null)[],
): number | null {
  const pairs: Array<[number, number]> = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i];
    const bv = b[i];
    if (av !== null && bv !== null && Number.isFinite(av) && Number.isFinite(bv)) {
      pairs.push([av, bv]);
    }
  }
  if (pairs.length < 2) return null;

  const meanA = pairs.reduce((s, [x]) => s + x, 0) / pairs.length;
  const meanB = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanA;
    const dy = y - meanB;
    numerator += dx * dy;
    denomA += dx * dx;
    denomB += dy * dy;
  }
  if (denomA === 0 || denomB === 0) return null;
  return numerator / Math.sqrt(denomA * denomB);
}

// NxN pairwise correlation matrix for a set of tickers, in the given order.
export function buildCorrelationMatrix(
  tickers: string[],
  returnsByTicker: Record<string, (number | null)[]>,
): (number | null)[][] {
  return tickers.map((rowTicker) =>
    tickers.map((colTicker) =>
      rowTicker === colTicker
        ? 1
        : pearsonCorrelation(returnsByTicker[rowTicker], returnsByTicker[colTicker]),
    ),
  );
}

export type MeanCovariance = {
  mean: number[]; // per-series daily mean, aligned to the input series order
  cov: number[][]; // sample covariance matrix (Bessel-corrected), daily
  numObservations: number;
};

// Mean vector + covariance matrix over the LISTWISE-complete rows of N
// series (only days where EVERY series has a value) -- required for a valid
// joint covariance matrix, unlike the pairwise-complete correlation matrix
// above (a per-pair covariance is fine for a single cell; a whole matrix
// needs one consistent sample of days shared by all series at once, or the
// resulting quadratic form w^T Sigma w isn't a coherent variance estimate).
// Shared by the Monte Carlo projection (lib/monte-carlo.ts) and the
// Efficient Frontier optimizer (lib/efficient-frontier.ts).
export function computeMeanCovariance(seriesList: (number | null)[][]): MeanCovariance | null {
  const k = seriesList.length;
  if (k === 0) return null;
  const n = seriesList[0]?.length ?? 0;

  const completeRows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = new Array(k);
    let complete = true;
    for (let j = 0; j < k; j++) {
      const v = seriesList[j][i];
      if (v === null || !Number.isFinite(v)) {
        complete = false;
        break;
      }
      row[j] = v;
    }
    if (complete) completeRows.push(row);
  }
  if (completeRows.length < 2) return null;

  const mean = new Array(k).fill(0);
  for (const row of completeRows) {
    for (let j = 0; j < k; j++) mean[j] += row[j];
  }
  for (let j = 0; j < k; j++) mean[j] /= completeRows.length;

  const cov: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const row of completeRows) {
    for (let a = 0; a < k; a++) {
      for (let b = 0; b < k; b++) {
        cov[a][b] += (row[a] - mean[a]) * (row[b] - mean[b]);
      }
    }
  }
  const denom = completeRows.length - 1;
  for (let a = 0; a < k; a++) {
    for (let b = 0; b < k; b++) cov[a][b] /= denom;
  }

  return { mean, cov, numObservations: completeRows.length };
}

function pairComplete(a: (number | null)[], b: (number | null)[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i];
    const bv = b[i];
    if (av !== null && bv !== null && Number.isFinite(av) && Number.isFinite(bv)) {
      pairs.push([av, bv]);
    }
  }
  return pairs;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type BetaAlpha = {
  beta: number;
  alpha: number; // annualized
};

// Beta: the slope of a regression of the stock's (or portfolio's) daily
// returns on the market benchmark's -- cov(stock, market) / var(market) --
// how much it amplifies or dampens the market's day-to-day moves. Assumes a
// linear relationship, which is a simplification: real sensitivity can
// change in different market regimes.
//
// Alpha (CAPM): the stock's own annualized return minus what its beta alone
// would predict, given the risk-free rate and the market's annualized return
// over the SAME window -- the part of its performance not explained by just
// riding the market. Uses the same risk-free rate as Sharpe, so the two are
// consistent with each other.
//
// Both require paired (stock, market) observations on the same days
// (listwise-complete), which is why the benchmark in market_data.json is
// inner-joined onto the same trading-day calendar as every stock.
export function computeBetaAlpha(
  returns: (number | null)[],
  marketReturns: (number | null)[],
  riskFreeRateAnnual: number,
  tradingDays = 252,
): BetaAlpha | null {
  const pairs = pairComplete(returns, marketReturns);
  if (pairs.length < 2) return null;

  const meanStock = mean(pairs.map(([s]) => s));
  const meanMarket = mean(pairs.map(([, m]) => m));

  let covariance = 0;
  let marketVariance = 0;
  for (const [s, m] of pairs) {
    const dm = m - meanMarket;
    covariance += (s - meanStock) * dm;
    marketVariance += dm * dm;
  }
  const denom = pairs.length - 1;
  covariance /= denom;
  marketVariance /= denom;
  if (marketVariance === 0) return null;

  const beta = covariance / marketVariance;
  const actualAnnualReturn = meanStock * tradingDays;
  const marketAnnualReturn = meanMarket * tradingDays;
  const expectedAnnualReturn =
    riskFreeRateAnnual + beta * (marketAnnualReturn - riskFreeRateAnnual);
  const alpha = actualAnnualReturn - expectedAnnualReturn;

  return { beta, alpha };
}
