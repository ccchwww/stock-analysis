import StatCard from "@/components/shared/StatCard";
import { formatPct, formatSignedPct, toneOf } from "@/lib/format";
import type { RiskMeta } from "@/lib/risk-types";

export type PortfolioRiskMetrics = {
  volatility: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  var95: number | null;
  es95: number | null;
  beta: number | null;
  alpha: number | null;
};

export default function PortfolioRiskSummary({
  metrics,
  numStocks,
  meta,
  benchmarkName,
}: {
  metrics: PortfolioRiskMetrics;
  numStocks: number;
  meta: RiskMeta;
  /** From market_data.json's benchmark entry (backtest/config.py). */
  benchmarkName: string;
}) {
  return (
    // Cards ordered so VaR and ES -- the tail-risk pair -- land together in
    // the same row (7 cards over 4 columns: row 1 = Vol/Sharpe/MaxDD/Beta,
    // row 2 = Alpha/VaR/ES).
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Annualized Volatility"
        value={metrics.volatility !== null ? formatPct(metrics.volatility, 1) : "n/a"}
        caption={`${numStocks} stocks, equal-weight`}
        explanation="How much the portfolio's daily returns swing around their average, scaled to a year — higher means a bumpier ride."
      />
      <StatCard
        label="Sharpe Ratio"
        value={metrics.sharpe !== null ? metrics.sharpe.toFixed(2) : "n/a"}
        tone={metrics.sharpe !== null ? toneOf(metrics.sharpe) : "neutral"}
        caption={`vs ${formatPct(meta.risk_free_rate_annual, 2)} risk-free rate`}
        explanation="Return earned per unit of risk taken, above the risk-free rate — higher is better risk-adjusted performance."
      />
      <StatCard
        label="Max Drawdown"
        value={metrics.maxDrawdown !== null ? formatSignedPct(metrics.maxDrawdown, 1) : "n/a"}
        tone={metrics.maxDrawdown !== null ? "negative" : "neutral"}
        caption="worst peak-to-trough decline"
        explanation="The deepest decline from a prior high over the window — what you'd have lived through at the low point."
      />
      <StatCard
        label="Beta"
        value={metrics.beta !== null ? metrics.beta.toFixed(2) : "n/a"}
        caption={`vs ${benchmarkName}`}
        explanation="How much this moves relative to the market. β=1 moves with the market; β>1 amplifies its swings; β<1 is steadier; β<0 moves opposite."
      />
      <StatCard
        label="Alpha (Annualized)"
        value={metrics.alpha !== null ? formatSignedPct(metrics.alpha, 1) : "n/a"}
        tone={metrics.alpha !== null ? toneOf(metrics.alpha) : "neutral"}
        caption="CAPM excess return"
        explanation="The return above what the portfolio's market exposure (beta) alone would predict. Positive = outperformed its risk-implied expectation."
      />
      <StatCard
        label={`VaR ${formatPct(meta.var_confidence, 0)} (1-day)`}
        value={metrics.var95 !== null ? formatPct(metrics.var95, 2) : "n/a"}
        tone={metrics.var95 !== null ? "negative" : "neutral"}
        caption="historical, empirical percentile"
        explanation="On this share of days, losses shouldn't exceed this figure — it says nothing about how bad the remaining days could be."
      />
      <StatCard
        label={`ES ${formatPct(meta.var_confidence, 0)} (1-day)`}
        value={metrics.es95 !== null ? formatPct(metrics.es95, 2) : "n/a"}
        tone={metrics.es95 !== null ? "negative" : "neutral"}
        caption="a.k.a. Conditional VaR"
        explanation="On the worst share of days, this is the AVERAGE loss — the severity VaR doesn't capture."
      />
    </div>
  );
}
