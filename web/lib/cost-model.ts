import { buildEquityCurveFromReturns } from "./equity-curve";
import { summarizeCurve } from "./performance";

// Re-prices a strategy at an arbitrary transaction-cost level, client-side,
// from the (net return, turnover) pair backtest/momentum_backtest.py exports.
//
// Why this is exact rather than an approximation: a strategy's cost on day i
// is `turnover[i] * cost_bps / 10_000`, and no strategy's SELECTION rule
// reads cost_bps -- they rank on returns, trailing returns, or volatility.
// So changing the cost assumption never changes which stocks get held, which
// means turnover is invariant and net return is a straight linear function of
// the cost level. The Python side re-derives that identity against a genuine
// re-run on every data refresh (`_verify_cost_linearity`), so this module
// cannot silently drift from the backtest it is standing in for.
//
// The alternative -- shipping five pre-computed cost scenarios per strategy --
// would multiply the payload and still only answer five questions; the
// break-even solver below needs to evaluate arbitrary bps values.

/** Search ceiling for the break-even solver. Well beyond any realistic
 *  retail cost, so hitting it means "no break-even in a plausible range"
 *  rather than "the answer is 500". */
export const MAX_SEARCH_BPS = 500;

/** Cost levels the sensitivity panel shows. The configured default is merged
 *  in at render time so this never hardcodes a value that lives in config.py. */
export const COST_SCENARIO_BPS = [0, 25, 50, 100];

export function costScenarioLevels(defaultBps: number): number[] {
  const set = new Set([...COST_SCENARIO_BPS, defaultBps]);
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Net daily returns restated at `newCostBps` instead of `baseCostBps`.
 * Positive when lowering the cost (a rebate of what was charged), negative
 * when raising it. Null days stay null -- a day the strategy wasn't trading
 * in has no cost to restate.
 */
export function repriceReturns(
  netReturns: (number | null)[],
  turnover: (number | null)[],
  baseCostBps: number,
  newCostBps: number,
): (number | null)[] {
  if (newCostBps === baseCostBps) return netReturns;
  const delta = (baseCostBps - newCostBps) / 10_000;
  return netReturns.map((r, i) => {
    if (r === null) return null;
    const t = turnover[i];
    return t === null ? r : r + t * delta;
  });
}

/**
 * Whole-window total return at a given cost level. Deliberately routed
 * through the SAME equity-curve builder and summarizer the tables and chart
 * use, so a number in the cost panel can never disagree with the same
 * strategy's number in the comparison table at the default cost.
 */
export function totalReturnAtCost({
  dates,
  netReturns,
  turnover,
  baseCostBps,
  newCostBps,
  initialCapital,
}: {
  dates: string[];
  netReturns: (number | null)[];
  turnover: (number | null)[];
  baseCostBps: number;
  newCostBps: number;
  initialCapital: number;
}): number | null {
  const repriced = repriceReturns(netReturns, turnover, baseCostBps, newCostBps);
  const curve = buildEquityCurveFromReturns(dates, repriced, initialCapital);
  return summarizeCurve(curve, initialCapital)?.totalReturn ?? null;
}

export type BreakEven =
  /** Solved: the cost level where the strategy and Buy & Hold tie. */
  | { kind: "solved"; bps: number }
  /** Behind Buy & Hold before a single dollar of cost is charged. */
  | { kind: "loses_at_zero" }
  /** Still ahead at the top of the search range. */
  | { kind: "beyond_range"; searchedTo: number }
  /** Not enough data in the window to compare. */
  | { kind: "unavailable" };

/**
 * The one-way cost, in bps, at which a strategy's total return falls to
 * equal-weight Buy & Hold's.
 *
 * BOTH sides are re-priced at the candidate cost, because Buy & Hold pays a
 * cost too (its one-off buy-in). Comparing a re-priced strategy against a
 * fixed-cost benchmark would quietly flatter the strategy.
 *
 * Solved by bisection rather than algebraically: total return is a product of
 * (1 + daily return) terms, so the cost enters multiplicatively across
 * hundreds of days and there is no closed form. The difference IS monotone
 * decreasing in cost whenever the strategy trades more than Buy & Hold (it
 * gives up more per basis point), which is true of every active strategy
 * here -- Buy & Hold trades once. The bracket check below is what actually
 * establishes a root exists; monotonicity is what makes it unique.
 */
export function solveBreakEvenBps({
  dates,
  netReturns,
  turnover,
  benchmarkReturns,
  benchmarkTurnover,
  baseCostBps,
  initialCapital,
  maxBps = MAX_SEARCH_BPS,
  toleranceBps = 0.01,
}: {
  dates: string[];
  netReturns: (number | null)[];
  turnover: (number | null)[];
  benchmarkReturns: (number | null)[];
  benchmarkTurnover: (number | null)[];
  baseCostBps: number;
  initialCapital: number;
  maxBps?: number;
  toleranceBps?: number;
}): BreakEven {
  const edgeAt = (bps: number): number | null => {
    const strategy = totalReturnAtCost({
      dates,
      netReturns,
      turnover,
      baseCostBps,
      newCostBps: bps,
      initialCapital,
    });
    const benchmark = totalReturnAtCost({
      dates,
      netReturns: benchmarkReturns,
      turnover: benchmarkTurnover,
      baseCostBps,
      newCostBps: bps,
      initialCapital,
    });
    if (strategy === null || benchmark === null) return null;
    return strategy - benchmark;
  };

  const atZero = edgeAt(0);
  const atMax = edgeAt(maxBps);
  if (atZero === null || atMax === null) return { kind: "unavailable" };
  if (atZero <= 0) return { kind: "loses_at_zero" };
  if (atMax > 0) return { kind: "beyond_range", searchedTo: maxBps };

  let low = 0; // edge > 0 here
  let high = maxBps; // edge <= 0 here
  while (high - low > toleranceBps) {
    const mid = (low + high) / 2;
    const edge = edgeAt(mid);
    if (edge === null) return { kind: "unavailable" };
    if (edge > 0) low = mid;
    else high = mid;
  }
  return { kind: "solved", bps: (low + high) / 2 };
}
