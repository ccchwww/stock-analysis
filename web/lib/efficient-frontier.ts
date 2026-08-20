// Classical (long-only) Markowitz mean-variance portfolio optimization,
// computed entirely client-side.
//
// Why client-side, not Python: every other number on this dashboard
// recomputes instantly for whatever stocks/start-date the user picks,
// because it's driven by daily-return arrays already loaded into the
// browser (see lib/returns-math.ts). Doing the frontier solve in Python
// instead would mean either precomputing it for one fixed window (breaking
// the start-date control, which every other metric on this page respects),
// or standing up a live API route that shells out to Python on every
// selection change -- a much heavier, more fragile dependency than this
// project otherwise has (it's static JSON + client compute, no backend).
// The optimization problem here is small (n = number of selected stocks,
// rarely more than ~50) and has a simple, provably-correct algorithm that
// doesn't need scipy: projected gradient descent/ascent on the probability
// simplex. Both the minimum-variance and (for a fixed risk-aversion level)
// maximum-utility problems below are convex/concave quadratics with a
// convex constraint set, so projected gradient methods are GUARANTEED to
// converge to the global optimum -- this isn't a heuristic. It also sidesteps
// a real numerical hazard of the textbook closed-form solution (weights
// proportional to Sigma^-1 * 1), which breaks down when Sigma is singular or
// near-singular -- e.g. two selected stocks that are almost perfectly
// correlated. Projected gradient never inverts Sigma, so it stays
// well-behaved there. Verified against known closed-form answers on
// synthetic cases before being wired into the UI.

import { computeMeanCovariance } from "./returns-math";

export type FrontierPoint = {
  weights: number[]; // long-only, sum to 1, aligned to the tickers array
  volatility: number; // annualized
  expectedReturn: number; // annualized
  sharpe: number;
};

export type EfficientFrontierResult = {
  tickers: string[];
  frontier: FrontierPoint[]; // sorted by ascending volatility
  minVariance: FrontierPoint;
  maxSharpe: FrontierPoint;
  cloud: FrontierPoint[]; // random long-only portfolios, for the scatter cloud
  numObservations: number;
};

// Below this many overlapping trading days across ALL selected stocks, the
// covariance estimate is too noisy to be worth showing (rather than an
// arbitrary "looks fine" threshold, this is disclosed on the page alongside
// numObservations so the user can judge for themselves).
const MIN_OBSERVATIONS = 20;

const NUM_LAMBDAS = 50; // coarse risk-aversion grid, for the plotted frontier curve
const ITERATIONS = 600; // projected-gradient steps per solve
const NUM_CLOUD_POINTS = 2000;
const REFINEMENT_STEPS = 40; // golden-section steps to sharpen the reported max-Sharpe point

function matVec(mat: number[][], vec: number[]): number[] {
  return mat.map((row) => row.reduce((sum, v, j) => sum + v * vec[j], 0));
}

function matTrace(mat: number[][]): number {
  return mat.reduce((sum, row, i) => sum + row[i], 0);
}

// Euclidean projection onto the probability simplex {w : sum(w) = 1, w >= 0}.
// Exact, O(n log n) (Held/Wolfe/Crowder 1974; Duchi et al. 2008). Every
// long-only constraint below is enforced by taking an unconstrained gradient
// step and snapping back onto this feasible set.
function projectToSimplex(v: number[]): number[] {
  const n = v.length;
  if (n === 1) return [1];
  const u = v.slice().sort((a, b) => b - a);
  const cumsum = new Array(n);
  cumsum[0] = u[0];
  for (let i = 1; i < n; i++) cumsum[i] = cumsum[i - 1] + u[i];
  let rho = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (u[i] + (1 - cumsum[i]) / (i + 1) > 0) {
      rho = i;
      break;
    }
  }
  const theta = (cumsum[rho] - 1) / (rho + 1);
  return v.map((vi) => Math.max(vi - theta, 0));
}

// Minimizes w^T Sigma w over the long-only simplex via projected gradient
// descent. Sigma is positive semi-definite, so this is a convex problem over
// a convex set -- projected gradient descent converges to the unique global
// minimum (up to the iteration budget's numerical precision).
function minimizeVariance(cov: number[][], iterations = ITERATIONS): number[] {
  const n = cov.length;
  let w = new Array(n).fill(1 / n);
  const lipschitz = matTrace(cov) || 1e-12;
  const step = 0.5 / lipschitz; // trace(Sigma) upper-bounds the largest eigenvalue, so this step is stable
  for (let t = 0; t < iterations; t++) {
    const grad = matVec(cov, w);
    w = projectToSimplex(w.map((wi, i) => wi - step * grad[i]));
  }
  return w;
}

// Maximizes the mean-variance utility w^T mu - (lambda/2) w^T Sigma w over
// the long-only simplex, via projected gradient ASCENT -- concave for
// lambda > 0, same convergence guarantee as minimizeVariance. Sweeping lambda
// over (0, infinity) traces out exactly the efficient (never the dominated)
// branch of the frontier: this "risk-aversion" parametrization is used
// instead of the more common "minimize variance subject to a target return"
// form specifically because it only ever needs a simplex projection, not the
// harder simplex-intersect-a-hyperplane one.
function maximizeUtility(
  mean: number[],
  cov: number[][],
  lambda: number,
  warmStart: number[],
  iterations = ITERATIONS,
): number[] {
  let w = warmStart.slice();
  const lipschitz = lambda * (matTrace(cov) || 1e-12);
  const step = 0.5 / Math.max(lipschitz, 1e-9);
  for (let t = 0; t < iterations; t++) {
    const sigmaW = matVec(cov, w);
    const grad = mean.map((m, i) => m - lambda * sigmaW[i]);
    w = projectToSimplex(w.map((wi, i) => wi + step * grad[i]));
  }
  return w;
}

function evaluate(
  weights: number[],
  mean: number[],
  cov: number[][],
  riskFreeRateAnnual: number,
  tradingDays: number,
): FrontierPoint {
  const dailyReturn = weights.reduce((sum, w, i) => sum + w * mean[i], 0);
  const sigmaW = matVec(cov, weights);
  const dailyVariance = Math.max(0, weights.reduce((sum, w, i) => sum + w * sigmaW[i], 0));
  const expectedReturn = dailyReturn * tradingDays;
  const volatility = Math.sqrt(dailyVariance * tradingDays);
  const sharpe = volatility > 0 ? (expectedReturn - riskFreeRateAnnual) / volatility : 0;
  return { weights, volatility, expectedReturn, sharpe };
}

// Uniform sample on the long-only simplex: Dirichlet(1,...,1), drawn via the
// standard i.i.d.-Exponential(1)-then-normalize trick. Used only for the
// visual scatter cloud, never for the solved min-variance/max-Sharpe points.
function randomSimplexPoint(n: number): number[] {
  const draws = Array.from({ length: n }, () => -Math.log(Math.random() || 1e-12));
  const total = draws.reduce((a, b) => a + b, 0);
  return draws.map((d) => d / total);
}

function logSpace(start: number, end: number, count: number): number[] {
  const logStart = Math.log(start);
  const logEnd = Math.log(end);
  return Array.from({ length: count }, (_, i) =>
    Math.exp(logStart + ((logEnd - logStart) * i) / (count - 1)),
  );
}

// Sharpens the max-Sharpe point beyond the coarse lambda grid's resolution:
// golden-section search over log(lambda) between its two grid neighbors.
// Valid because Sharpe-along-the-frontier is unimodal in lambda (rises from
// the min-variance end to the tangency point, then falls back toward the
// max-return corner) -- verified on synthetic cases with a known answer
// before this went into the UI.
function refineMaxSharpe(
  mean: number[],
  cov: number[][],
  riskFreeRateAnnual: number,
  tradingDays: number,
  lambdaLo: number,
  lambdaHi: number,
  warmStart: number[],
): FrontierPoint {
  const gr = (Math.sqrt(5) - 1) / 2;
  let lo = Math.log(lambdaLo);
  let hi = Math.log(lambdaHi);
  const evalAt = (logLambda: number) =>
    evaluate(maximizeUtility(mean, cov, Math.exp(logLambda), warmStart), mean, cov, riskFreeRateAnnual, tradingDays);

  let c = hi - gr * (hi - lo);
  let d = lo + gr * (hi - lo);
  let fc = evalAt(c);
  let fd = evalAt(d);
  for (let i = 0; i < REFINEMENT_STEPS; i++) {
    if (fc.sharpe > fd.sharpe) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - gr * (hi - lo);
      fc = evalAt(c);
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + gr * (hi - lo);
      fd = evalAt(d);
    }
  }
  return fc.sharpe > fd.sharpe ? fc : fd;
}

export function computeEfficientFrontier({
  tickers,
  returnsByTicker,
  riskFreeRateAnnual,
  tradingDays,
}: {
  tickers: string[];
  returnsByTicker: Record<string, (number | null)[]>;
  riskFreeRateAnnual: number;
  tradingDays: number;
}): EfficientFrontierResult | null {
  if (tickers.length < 2) return null;

  const seriesList = tickers.map((t) => returnsByTicker[t] ?? []);
  const moments = computeMeanCovariance(seriesList);
  if (!moments || moments.numObservations < MIN_OBSERVATIONS) return null;

  const { mean, cov, numObservations } = moments;
  const n = tickers.length;

  const minVarWeights = minimizeVariance(cov);
  const minVariance = evaluate(minVarWeights, mean, cov, riskFreeRateAnnual, tradingDays);

  // Lambda's units are return/variance (utility = w.mu - (lambda/2) w'Sigma w
  // must come out in units of return), so it must be swept relative to a
  // return-over-variance reference, NOT variance alone -- an earlier version
  // of this scaled lambda by the covariance's own magnitude only, which for
  // realistic stock data left the whole sweep stuck deep in "return-chasing"
  // or "risk-averse" territory depending on the specific numbers, never
  // spanning the actual transition and collapsing the frontier to a single
  // point. meanSpread/varScale has the right units (it's the mean return
  // range divided by a representative variance) and sits near the natural
  // transition point between the two regimes, discovered and verified
  // against a realistic synthetic case before this fix went in.
  const varScale = matTrace(cov) / n || 1e-9;
  const meanSpread = Math.max(...mean) - Math.min(...mean) || 1e-9;
  const naturalLambda = meanSpread / varScale;
  const lambdaMultipliers = logSpace(1e-4, 1e4, NUM_LAMBDAS);

  // Sweep from HIGH lambda (the min-variance end) down to LOW lambda (the
  // max-return end), warm-starting each solve from the previous (adjacent)
  // lambda's weights -- fewer iterations to converge, and it keeps the
  // sequence of solutions numerically continuous.
  const frontier: FrontierPoint[] = [];
  let warm = minVarWeights.slice();
  for (let i = lambdaMultipliers.length - 1; i >= 0; i--) {
    const lambda = lambdaMultipliers[i] * naturalLambda;
    const w = maximizeUtility(mean, cov, lambda, warm);
    warm = w;
    frontier.push(evaluate(w, mean, cov, riskFreeRateAnnual, tradingDays));
  }
  frontier.sort((a, b) => a.volatility - b.volatility);

  let maxSharpe = minVariance;
  for (const point of frontier) {
    if (point.sharpe > maxSharpe.sharpe) maxSharpe = point;
  }

  // Sharpen beyond the coarse grid's resolution with a golden-section search
  // over the SAME full lambda range the grid swept (extended 10x on each
  // side as a safety margin) -- simpler and just as effective as bracketing
  // around the best grid point's immediate neighbors, and avoids needing to
  // recover a lambda value from `frontier`, which is sorted by volatility
  // (for display) rather than kept in lambda order.
  const bracketLo = (lambdaMultipliers[0] * naturalLambda) / 10;
  const bracketHi = lambdaMultipliers[lambdaMultipliers.length - 1] * naturalLambda * 10;
  const refined = refineMaxSharpe(mean, cov, riskFreeRateAnnual, tradingDays, bracketLo, bracketHi, minVarWeights);
  if (refined.sharpe > maxSharpe.sharpe) maxSharpe = refined;

  const cloud = Array.from({ length: NUM_CLOUD_POINTS }, () =>
    evaluate(randomSimplexPoint(n), mean, cov, riskFreeRateAnnual, tradingDays),
  );

  return { tickers, frontier, minVariance, maxSharpe, cloud, numObservations };
}
