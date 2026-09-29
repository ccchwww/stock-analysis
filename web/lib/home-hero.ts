// Hero background art + stats strip for the landing page. Like
// home-findings.ts, everything here is computed at BUILD TIME from the same
// JSON the dashboards read, using the existing lib functions -- no
// reimplemented math, nothing hardcoded, and no raw data handed to the
// client. The page inlines the resulting SVG path strings, so the browser
// receives a few hundred bytes of geometry rather than a returns series.

import { buildEquityCurveFromReturns, sampleForChart } from "./equity-curve";
import { computeVarBacktest } from "./var-backtest";
import type { ResultsData } from "./types";
import type { MarketData } from "./market-data-types";
import type { StressData } from "./stress-data-types";
import type { ValidationData } from "./validation-types";

// Normalized drawing space. The SVG scales to whatever box the hero gives
// it (preserveAspectRatio="none"), so these are arbitrary units chosen to
// keep the path strings short.
const VIEW_W = 600;
const VIEW_H = 200;
// Vertical breathing room so the curve never touches the top/bottom edge.
const PAD_Y = 0.1 * VIEW_H;
const CURVE_POINTS = 150;
const MAX_EXCEPTION_DOTS = 5;

export type HeroDot = { x: number; y: number };

export type HeroArt = {
  viewBox: string;
  /** The Buy & Hold equity curve as an SVG path. */
  linePath: string;
  /** Same curve closed to the baseline, for the gradient fill underneath. */
  areaPath: string;
  /** Largest-loss 99% VaR exception days on that same curve. May be empty. */
  dots: HeroDot[];
};

export type HeroStat = { label: string; value: string };

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function yearsBetween(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO}T00:00:00Z`).getTime();
  return (end - start) / (365.2425 * 24 * 60 * 60 * 1000);
}

export function computeHeroArt(results: ResultsData): HeroArt | null {
  const dates = results.meta.dates;
  const buyHold = results.strategies["buy_hold"];
  if (!buyHold || dates.length < 2) return null;

  // Same construction the Strategies tab charts: compound the daily series
  // into a $-value curve anchored at the initial capital.
  const fullCurve = buildEquityCurveFromReturns(dates, buyHold.daily_returns, results.meta.initial_capital);
  if (fullCurve.length < 2) return null;

  const sampled = sampleForChart(fullCurve, CURVE_POINTS);
  const values = fullCurve.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  // Position is taken from each point's index in the FULL series, so a
  // downsampled curve and an exception dot land on the same x scale.
  const indexByDate = new Map(dates.map((d, i) => [d, i]));
  const xAt = (i: number) => (i / (dates.length - 1)) * VIEW_W;
  const yAt = (value: number) => VIEW_H - PAD_Y - ((value - min) / span) * (VIEW_H - 2 * PAD_Y);

  const points = sampled.map((p) => {
    const i = indexByDate.get(p.date) ?? 0;
    return { x: round(xAt(i)), y: round(yAt(p.value)) };
  });

  // "M x y L x y x y x y ..." -- after the first L, further coordinate
  // pairs are implicit linetos. Same geometry, ~20% fewer characters, and
  // this string is inlined twice (HTML + RSC payload) so it's worth it.
  const linePath =
    `M${points[0].x} ${points[0].y} L` + points.slice(1).map((p) => `${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} ${VIEW_W} ${VIEW_H} 0 ${VIEW_H} Z`;

  // VaR exceptions on the SAME series the curve plots -- the 99% historical
  // VaR of the Buy & Hold portfolio, breached by its own realized return.
  // Anything else (a different portfolio's exceptions) would be drawing two
  // unrelated things on one axis.
  const backtest = computeVarBacktest({
    dates,
    returns: buyHold.daily_returns,
    startDate: dates[0],
  });

  const dots: HeroDot[] = (backtest?.chartPoints ?? [])
    .filter((p) => p.actualReturn !== null && p.varHist99 !== null && p.actualReturn < -p.varHist99)
    .sort((a, b) => (a.actualReturn ?? 0) - (b.actualReturn ?? 0)) // biggest loss first
    .slice(0, MAX_EXCEPTION_DOTS)
    .map((p) => {
      const i = indexByDate.get(p.date) ?? 0;
      return { x: round(xAt(i)), y: round(yAt(fullCurve[i]?.value ?? min)) };
    });

  return { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, linePath, areaPath, dots };
}

export function computeHeroStats({
  marketData,
  stressData,
  validationData,
  varBacktestDays,
}: {
  marketData: MarketData;
  stressData: StressData;
  validationData: ValidationData;
  /** Evaluable observations in the VaR backtest, from home-findings. */
  varBacktestDays: number | null;
}): HeroStat[] {
  // The two datasets overlap (stress runs 2005->2022, market 2021->today),
  // so their union is one continuous span rather than two disjoint chunks --
  // which is what makes "years of price history" an honest single number.
  const earliest =
    stressData.meta.date_range.start < marketData.meta.date_range.start
      ? stressData.meta.date_range.start
      : marketData.meta.date_range.start;
  const latest =
    stressData.meta.date_range.end > marketData.meta.date_range.end
      ? stressData.meta.date_range.end
      : marketData.meta.date_range.end;

  const stats: HeroStat[] = [
    { label: "Tickers covered", value: String(marketData.meta.num_tickers) },
    { label: "Years of price history", value: yearsBetween(earliest, latest).toFixed(1) },
  ];
  if (varBacktestDays !== null) {
    stats.push({ label: "VaR backtest days", value: varBacktestDays.toLocaleString("en-US") });
  }
  stats.push({ label: "Crises replayed", value: String(validationData.stress.windows.length) });
  return stats;
}
