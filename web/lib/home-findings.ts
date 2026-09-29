// Headline findings for the landing page, computed at BUILD TIME from the
// same JSON and the same lib functions the Model Validation tab uses --
// never hardcoded, because the data refreshes every weeknight
// (.github/workflows/refresh-data.yml) and a stale hand-written number on
// the front page would be exactly the kind of unverified claim the rest of
// this site exists to avoid.
//
// This module reimplements NO math. It calls computeVarBacktest() and
// computeStressTestResults() with the same inputs the Validation tab
// passes when the "Big 5 Banks (concentration demo)" preset is selected at
// its default start date, so every number here matches that page exactly.
//
// Everything returned is small and plain-serializable: the home page hands
// these objects to a client component for the spotlight effect, and must
// never ship market_data.json / stress_data.json to the browser (the
// Validation page already ships ~2.9 MB of HTML; the home page stays tiny).

import { combineEqualWeight } from "./returns-math";
import { computeVarBacktest, earliestBacktestableDate } from "./var-backtest";
import { computeStressTestResults, type StressWindow } from "./stress-test";
import { BIG_FIVE_BANKS_PRESET } from "./stock-presets";
import type { MarketData } from "./market-data-types";
import type { StressData } from "./stress-data-types";
import type { RiskMeta } from "./risk-types";
import type { ValidationData } from "./validation-types";

export type Finding = {
  key: string;
  /** Short label for the card's eyebrow row. */
  eyebrow: string;
  /** The computed number/verdict, big and monospace. */
  value: string;
  /** Conditional one-liner -- only ever states what the data supports. */
  headline: string;
  /** Supporting detail, also conditional. */
  detail: string;
  href: string;
  /** Drives the accent color: "negative" for a finding that counts against
   * the model, "positive" when it passes, "neutral" when it's descriptive. */
  tone: "positive" | "negative" | "neutral";
};

export type HomeFindings = {
  findings: Finding[];
  /** For the section label: which selection and which data vintage. */
  presetLabel: string;
  dataAsOf: string;
  startDate: string;
  /** Evaluable observations in the backtest -- reused by the hero stats
   * strip so both report the same sample size. */
  varBacktestDays: number | null;
};

function pct(fraction: number, digits = 2): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

// --- Card A: does the VaR breach the right NUMBER of times, and at
// independent TIMES? Kupiec tests the count, Christoffersen the clustering.
// The interesting case (and the one this project actually finds) is
// "count right, timing wrong" -- but that is asserted only when both tests
// literally say so.
function clusteringFinding(kupiecRejects: boolean, christoffersenRejects: boolean, kupiecP: number, christP: number, href: string): Finding {
  const base = { key: "clustering", eyebrow: "VaR exception clustering", href };
  const ps = `Kupiec p=${kupiecP.toFixed(3)} · Christoffersen p=${christP.toFixed(3)}`;

  if (!kupiecRejects && christoffersenRejects) {
    return {
      ...base,
      value: "Right count, wrong timing",
      headline: "The 95% VaR breaches about as often as it should — but the breaches cluster.",
      detail: `Kupiec (coverage) passes while Christoffersen (independence) rejects at 5% significance. Losses arrive in runs during volatile stretches, which a correctly-calibrated model should not do. ${ps}`,
      tone: "negative",
    };
  }
  if (kupiecRejects && christoffersenRejects) {
    return {
      ...base,
      value: "Count and timing both off",
      headline: "The 95% VaR fails both the coverage and the independence test.",
      detail: `Kupiec and Christoffersen both reject at 5% significance — the breach rate is off target and the breaches also cluster in time. ${ps}`,
      tone: "negative",
    };
  }
  if (kupiecRejects && !christoffersenRejects) {
    return {
      ...base,
      value: "Wrong count, timing OK",
      headline: "The 95% VaR breaches the wrong number of times, but the breaches are independent.",
      detail: `Kupiec (coverage) rejects at 5% significance while Christoffersen (independence) does not. ${ps}`,
      tone: "negative",
    };
  }
  return {
    ...base,
    value: "Both tests pass",
    headline: "The 95% VaR passes both the coverage and the independence test.",
    detail: `Neither Kupiec nor Christoffersen rejects at 5% significance on this sample. A pass is not proof the model is right — only that this sample gives no strong evidence against it. ${ps}`,
    tone: "positive",
  };
}

// --- Card B: parametric (normal) VaR at 99% vs the fat tails that make it
// fail. The kurtosis figure is reported regardless; the verdict about
// parametric VaR is conditional on what Kupiec actually says AND on which
// direction the breach rate is off.
function fatTailFinding(
  kupiecRejects: boolean,
  kupiecP: number,
  exceptionRate: number,
  nominalRate: number,
  excessKurtosis: number | null,
  href: string,
): Finding {
  const base = { key: "fat_tails", eyebrow: "Parametric VaR & fat tails", href };
  const kurtText =
    excessKurtosis === null
      ? "Excess kurtosis unavailable for this sample."
      : excessKurtosis > 0
        ? `Excess kurtosis is ${excessKurtosis.toFixed(2)} — extreme days are more common than a normal distribution predicts (a normal has exactly 0).`
        : `Excess kurtosis is ${excessKurtosis.toFixed(2)}, at or below the normal distribution's 0.`;
  const rateText = `Observed ${pct(exceptionRate)} vs a nominal ${pct(nominalRate)}. Kupiec p=${kupiecP.toFixed(3)}.`;

  if (kupiecRejects && exceptionRate > nominalRate) {
    return {
      ...base,
      value: `${pct(exceptionRate)} vs ${pct(nominalRate)}`,
      headline: "Normal-distribution VaR is breached significantly more often than it promises.",
      detail: `${rateText} ${kurtText} This is the empirical case for a volatility model such as GARCH.`,
      tone: "negative",
    };
  }
  if (kupiecRejects && exceptionRate < nominalRate) {
    return {
      ...base,
      value: `${pct(exceptionRate)} vs ${pct(nominalRate)}`,
      headline: "Normal-distribution VaR is breached significantly less often than it promises.",
      detail: `${rateText} It is too conservative here rather than too permissive. ${kurtText}`,
      tone: "negative",
    };
  }
  // Kupiec does not reject -- say only that, and let kurtosis speak for
  // itself. Not rejecting at n~1000 is weak evidence, not a clean bill.
  return {
    ...base,
    value: excessKurtosis !== null ? `Kurtosis ${excessKurtosis.toFixed(2)}` : `${pct(exceptionRate)} vs ${pct(nominalRate)}`,
    headline:
      excessKurtosis !== null && excessKurtosis > 0
        ? "Returns have fatter tails than normal, though the 99% breach rate isn't statistically off at this sample size."
        : "The 99% parametric VaR breach rate is not statistically distinguishable from its nominal level here.",
    detail: `${rateText} ${kurtText} Kupiec's power is limited over a sample this short, so a pass is not evidence the normal assumption holds.`,
    tone: "neutral",
  };
}

// --- Card C: correlation during crises vs the calm-period baseline. Names
// the single worst window rather than averaging, since the point is that
// diversification fails hardest exactly once.
function correlationFinding(
  baseline: number | null,
  worst: { label: string; value: number } | null,
  href: string,
): Finding {
  const base = { key: "correlation", eyebrow: "Correlation under stress", href };
  if (baseline === null || worst === null) {
    return {
      ...base,
      value: "n/a",
      headline: "Not enough paired data to compare calm-period and crisis correlations for this selection.",
      detail: "Correlation needs at least two stocks with overlapping history inside a stress window.",
      tone: "neutral",
    };
  }
  const delta = worst.value - baseline;
  if (delta > 0) {
    return {
      ...base,
      value: `${baseline.toFixed(2)} → ${worst.value.toFixed(2)}`,
      headline: `Correlations rose when it mattered most — peaking in the ${worst.label}.`,
      detail: `Average pairwise correlation runs ${baseline.toFixed(2)} outside the crisis windows but reaches ${worst.value.toFixed(2)} during the ${worst.label} (+${delta.toFixed(2)}). Diversification shrinks exactly when it is needed, and mean-variance optimization — calibrated on calm-period data — cannot see it coming.`,
      tone: "negative",
    };
  }
  return {
    ...base,
    value: `${baseline.toFixed(2)} → ${worst.value.toFixed(2)}`,
    headline: `Crisis correlations did not exceed the calm-period baseline for this selection.`,
    detail: `Average pairwise correlation is ${baseline.toFixed(2)} outside the crisis windows; the highest any single window reached was ${worst.value.toFixed(2)} (${worst.label}).`,
    tone: "neutral",
  };
}

// --- Card D: did the "optimal" portfolio actually beat the naive one?
// Counts windows where max-Sharpe underperformed equal-weight, and reports
// zero honestly if that's what the data says.
function optimizerFinding(
  underperformed: string[],
  comparable: number,
  href: string,
): Finding {
  const base = { key: "optimizer", eyebrow: "Optimizer vs naive blend", href };
  if (comparable === 0) {
    return {
      ...base,
      value: "n/a",
      headline: "No crisis window had enough pre-window data to estimate optimized weights out-of-sample.",
      detail: "Max-Sharpe weights are estimated only from the 3 years before each window opens; with too few qualifying stocks the comparison is reported as unavailable rather than computed in-sample.",
      tone: "neutral",
    };
  }
  if (underperformed.length === 0) {
    return {
      ...base,
      value: `0 of ${comparable}`,
      headline: "The max-Sharpe portfolio matched or beat an equal-weight blend in every comparable crisis.",
      detail: `Across ${comparable} crisis window${comparable === 1 ? "" : "s"} with sufficient out-of-sample data, the optimizer did not underperform the naive blend. Mean-variance weights remain sensitive to estimation error — this selection simply did not expose it.`,
      tone: "positive",
    };
  }
  return {
    ...base,
    value: `${underperformed.length} of ${comparable}`,
    headline: `The "optimal" portfolio lost to an equal-weight blend in ${underperformed.length} of ${comparable} crises.`,
    detail: `Max-Sharpe weights — estimated out-of-sample from the 3 years before each window — underperformed a naive equal-weight blend in the ${underperformed.join(", ")}. Mean-variance optimization is highly sensitive to its own mean-return estimates; this is that sensitivity showing up in real data, not a hypothetical.`,
    tone: "negative",
  };
}

export function computeHomeFindings({
  marketData,
  stressData,
  validationData,
  riskMeta,
}: {
  marketData: MarketData;
  stressData: StressData;
  validationData: ValidationData;
  riskMeta: RiskMeta;
}): HomeFindings {
  const tickers = BIG_FIVE_BANKS_PRESET.tickers.filter((t) => marketData.stocks[t]);

  // Mirrors ModelValidationDashboard exactly: equal-weight blend of the
  // selection, full (unsliced) history, and the same default start date
  // (the earliest date with a full 250-day warmup behind it).
  const startDate = earliestBacktestableDate(marketData.meta.dates, validationData.meta.var_window_days);
  const portfolioReturns = combineEqualWeight(
    tickers.map((t) => ({ id: t, returns: marketData.stocks[t].returns })),
  );
  const varResult = computeVarBacktest({
    dates: marketData.meta.dates,
    returns: portfolioReturns,
    startDate,
  });

  const hist95 = varResult?.results.find((r) => r.method === "historical" && r.confidence === 0.95) ?? null;
  const param99 = varResult?.results.find((r) => r.method === "parametric" && r.confidence === 0.99) ?? null;

  // Stress testing uses the separate long-history dataset and its own fixed
  // windows -- same call the Validation tab's StressTestSection makes.
  const windows: StressWindow[] = validationData.stress.windows.map((w) => ({
    key: w.key,
    label: w.label,
    start: w.start,
    end: w.end,
    lookbackStart: w.lookback_start,
  }));
  const stressTickers = tickers.filter((t) => stressData.stocks[t]);
  const returnsByTicker: Record<string, (number | null)[]> = {};
  for (const t of Object.keys(stressData.stocks)) returnsByTicker[t] = stressData.stocks[t].returns;

  const stressResults = stressTickers.length
    ? computeStressTestResults({
        windows,
        tickers: stressTickers,
        dates: stressData.meta.dates,
        returnsByTicker,
        benchmarkReturns: stressData.benchmark.returns,
        riskFreeRateAnnual: riskMeta.risk_free_rate_annual,
        tradingDays: riskMeta.trading_days_per_year,
        minCoverageFraction: validationData.stress.min_coverage_fraction,
      })
    : [];

  const baseline = stressResults[0]?.correlation.baseline ?? null;
  const worstCorrelation = stressResults.reduce<{ label: string; value: number } | null>((best, r) => {
    if (r.correlation.stress === null) return best;
    if (!best || r.correlation.stress > best.value) return { label: r.window.label, value: r.correlation.stress };
    return best;
  }, null);

  // Only windows where BOTH figures exist are comparable -- a window whose
  // optimized weights were unavailable is excluded from the denominator
  // rather than silently counted as a non-underperformance.
  const comparableWindows = stressResults.filter((r) => r.maxSharpe.stats && r.equalWeight);
  const underperformed = comparableWindows
    .filter((r) => r.maxSharpe.stats!.totalReturn < r.equalWeight!.totalReturn)
    .map((r) => r.window.label);

  const findings: Finding[] = [];
  if (hist95) {
    findings.push(
      clusteringFinding(
        hist95.kupiec.reject,
        hist95.christoffersen.reject,
        hist95.kupiec.pValue,
        hist95.christoffersen.pValue,
        "/validation",
      ),
    );
  }
  if (param99) {
    findings.push(
      fatTailFinding(
        param99.kupiec.reject,
        param99.kupiec.pValue,
        param99.exceptionRate,
        1 - param99.confidence,
        varResult?.excessKurtosis ?? null,
        "/validation",
      ),
    );
  }
  findings.push(correlationFinding(baseline, worstCorrelation, "/validation"));
  findings.push(optimizerFinding(underperformed, comparableWindows.length, "/risk-dashboard"));

  return {
    findings,
    presetLabel: BIG_FIVE_BANKS_PRESET.label,
    dataAsOf: marketData.meta.date_range.end,
    startDate,
    varBacktestDays: hist95?.n ?? null,
  };
}
