import type { EfficientFrontierResult } from "@/lib/efficient-frontier";
import { formatPct } from "@/lib/format";
import EfficientFrontierChart from "./EfficientFrontierChart";
import EfficientFrontierWeights from "./EfficientFrontierWeights";

export default function EfficientFrontierSection({
  tickers,
  names,
  result,
}: {
  tickers: string[];
  names: Record<string, string>;
  // null either because <2 stocks are selected, or (when 2+ are selected)
  // there isn't enough overlapping history for a reliable covariance
  // estimate -- tickers.length distinguishes which, below.
  result: EfficientFrontierResult | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Efficient Frontier</h2>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        For the selected stocks, this finds the portfolios that give the
        maximum expected return for a given level of risk (annualized
        volatility) — the classic Markowitz mean-variance optimization.
        Points ON the frontier curve are &ldquo;efficient&rdquo;: no other
        long-only combination of these stocks gets more return without
        taking on more risk. Every point in the cloud BELOW or to the right
        of the curve is dominated by some point on it. Two portfolios are
        marked: <span className="text-violet-300">Minimum Variance</span> —
        the single safest combination available, regardless of return — and{" "}
        <span className="text-amber-300">Maximum Sharpe</span>{" "}
        (the &ldquo;tangency&rdquo; portfolio) — the one with the best return per
        unit of risk. Constraints: long-only (no short positions, every
        weight ≥ 0) and fully invested (weights sum to 100%).
      </p>

      <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          Read this before trusting the weights below
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
          This entire chart is built from each stock&apos;s <em>historical</em>{" "}
          mean return and covariance over the selected window, used as a
          stand-in for their future behavior — an assumption that&apos;s
          convenient, not reliable. Mean-variance optimization is notoriously
          sensitive to those inputs, especially expected returns: they&apos;re
          hard to estimate precisely, historical averages are noisy, and
          small changes to them can swing the &ldquo;optimal&rdquo; weights
          dramatically — including toward extreme, concentrated allocations
          that happened to look good in this specific historical window but
          have no particular reason to keep doing so. This is a well-known,
          widely-discussed limitation of textbook Markowitz optimization, not
          an implementation bug — real practitioners address it with
          techniques like shrinkage estimators, additional constraints, or
          the Black-Litterman model (which blends historical data with
          independent views) rather than feeding raw historical estimates
          straight into an optimizer, which is what this feature does for
          illustration. Treat the frontier shape as a reasonable
          illustration of the diversification trade-off among these specific
          stocks over this specific window, and the exact weights as a
          starting point for further thought, not a recommendation.
        </p>
      </div>

      <div className="mt-4">
        {tickers.length < 2 ? (
          <div className="flex h-32 items-center justify-center text-sm text-zinc-500">
            Select 2+ stocks above to compute an efficient frontier.
          </div>
        ) : !result ? (
          <div className="flex h-32 items-center justify-center text-center text-sm text-zinc-500">
            Not enough overlapping trading days across the selected stocks in
            this window for a reliable covariance estimate. Try a broader
            start date or a different combination of stocks.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <EfficientFrontierChart
              tickers={tickers}
              names={names}
              cloud={result.cloud}
              frontier={result.frontier}
              minVariance={result.minVariance}
              maxSharpe={result.maxSharpe}
            />
            <p className="text-xs text-zinc-500">
              Based on {result.numObservations} overlapping trading days.
              Minimum Variance: {formatPct(result.minVariance.volatility, 1)} volatility,{" "}
              {formatPct(result.minVariance.expectedReturn, 1)} expected return. Maximum
              Sharpe: {formatPct(result.maxSharpe.volatility, 1)} volatility,{" "}
              {formatPct(result.maxSharpe.expectedReturn, 1)} expected return,{" "}
              {result.maxSharpe.sharpe.toFixed(2)} Sharpe.
            </p>
            <EfficientFrontierWeights
              tickers={tickers}
              names={names}
              minVariance={result.minVariance}
              maxSharpe={result.maxSharpe}
            />
          </div>
        )}
      </div>
    </div>
  );
}
