import type { DerivedStats } from "./derived-stats";
import type { Tone } from "./format";

export type StrategyComparison = {
  id: string;
  label: string;
  totalReturn: number;
  diffVsBenchmarkPts: number;
  beatsBenchmark: boolean;
};

export type Verdict = {
  tone: Tone;
  headline: string;
  detail: string;
  comparisons: StrategyComparison[];
};

const BENCHMARK_ID = "buy_hold";

// Strategies that RANK the universe and buy a subset of it. These are the
// ones survivorship bias inflates most: the universe is today's S&P/TSX 60
// applied backwards, so names dropped from the index are absent entirely,
// and a strategy that picks from that pool is choosing among companies
// already filtered for survival. Buy & Hold holds that same filtered
// universe, so it's biased too -- but a selection strategy compounds the
// bias, which is exactly why the OUTPERFORMANCE GAP (not just the level) is
// overstated.
//
// 12-month momentum is the most affected: ranking on a full year of prior
// return is the closest thing here to selecting on "did this name do well
// and still exist", which is what the survivorship filter guarantees.
// Low Volatility is included for a slightly different reason -- it does not
// rank on past return, but a company that was quietly compounding rather
// than collapsing is exactly the kind that stays in the index, so its
// screen still reads a survivor-filtered pool.
const SELECTION_STRATEGY_IDS = new Set([
  "momentum_1d",
  "momentum_12m",
  "mean_reversion",
  "low_vol",
]);

export function isSelectionStrategy(id: string): boolean {
  return SELECTION_STRATEGY_IDS.has(id);
}

function fmtPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

function fmtSignedPts(pts: number, digits = 1): string {
  return `${pts >= 0 ? "+" : ""}${pts.toFixed(digits)} pts`;
}

// Compares every non-benchmark strategy's total return (over whatever start
// date is currently selected) against Buy & Hold, and derives an honest
// headline purely from those numbers -- a losing strategy is never reframed
// as a win. Every input total_return already has the assumed trading cost
// baked in (see costs.py), so this is a post-cost comparison; the cost
// assumption is just spelled out again here for clarity.
export function computeVerdict(
  strategies: Record<string, DerivedStats>,
  order: string[],
  costBps: number,
): Verdict | null {
  const benchmark = strategies[BENCHMARK_ID];
  if (!benchmark || benchmark.totalReturn === null) return null;
  const activeIds = order.filter(
    (id) => id !== BENCHMARK_ID && strategies[id]?.totalReturn !== null,
  );
  if (activeIds.length === 0) return null;

  const comparisons: StrategyComparison[] = activeIds.map((id) => {
    const s = strategies[id];
    const diffVsBenchmarkPts = (s.totalReturn! - benchmark.totalReturn!) * 100;
    return {
      id,
      label: s.label,
      totalReturn: s.totalReturn!,
      diffVsBenchmarkPts,
      beatsBenchmark: diffVsBenchmarkPts > 0,
    };
  });

  const winners = comparisons.filter((c) => c.beatsBenchmark);
  const losers = comparisons.filter((c) => !c.beatsBenchmark);
  const benchmarkPct = fmtPct(benchmark.totalReturn);
  const costSuffix = ` All figures are net of an assumed ${costBps.toFixed(0)} bps per-trade cost.`;

  const describe = (c: StrategyComparison) =>
    `${c.label} (${fmtPct(c.totalReturn)}, ${fmtSignedPts(c.diffVsBenchmarkPts)})`;

  if (winners.length === 0) {
    return {
      tone: "negative",
      headline: `None of the active strategies beat ${benchmark.label}`,
      detail: `${benchmark.label} returned ${benchmarkPct} over the period. ${losers
        .map(describe)
        .join("; ")} all trailed it — simply holding the universe won here.${costSuffix}`,
      comparisons,
    };
  }

  if (losers.length === 0) {
    return {
      tone: "positive",
      headline: `All active strategies beat ${benchmark.label}`,
      detail: `Against a ${benchmarkPct} ${benchmark.label} baseline: ${winners
        .map(describe)
        .join("; ")}.${costSuffix}`,
      comparisons,
    };
  }

  return {
    tone: "neutral",
    headline: `Mixed — ${winners.length} of ${activeIds.length} active strategies beat ${benchmark.label}`,
    detail: `Against a ${benchmarkPct} ${benchmark.label} baseline: ${winners
      .map(describe)
      .join("; ")} came out ahead, while ${losers
      .map(describe)
      .join("; ")} did not.${costSuffix}`,
    comparisons,
  };
}

export function getBestStrategy(
  strategies: Record<string, DerivedStats>,
  order: string[],
): DerivedStats | null {
  const rows = order.map((id) => strategies[id]).filter((s): s is DerivedStats => Boolean(s) && s.totalReturn !== null);
  if (rows.length === 0) return null;
  return rows.reduce((best, s) => (s.totalReturn! > best.totalReturn! ? s : best));
}
