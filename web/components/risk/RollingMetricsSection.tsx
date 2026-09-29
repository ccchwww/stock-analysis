"use client";

import { useMemo } from "react";
import type { RiskMeta } from "@/lib/risk-types";
import { ROLLING_WINDOW_DAYS, rollingVolatility, rollingSharpe, rollingBeta } from "@/lib/rolling-metrics";
import { buildRollingChartData, sampleRowsForChart } from "@/lib/rolling-chart-data";
import { formatPct } from "@/lib/format";
import RollingMetricsChart from "./RollingMetricsChart";

export type RollingTarget = {
  id: string;
  label: string;
  color: string;
  returns: (number | null)[];
};

export default function RollingMetricsSection({
  dates,
  targets,
  marketReturns,
  meta,
  benchmarkName,
}: {
  dates: string[];
  targets: RollingTarget[];
  marketReturns: (number | null)[];
  meta: RiskMeta;
  /** From market_data.json's own benchmark entry, never a literal -- the
   *  CAPM benchmark is set in backtest/config.py and this label follows it. */
  benchmarkName: string;
}) {
  const volRows = useMemo(
    () =>
      sampleRowsForChart(
        buildRollingChartData(
          dates,
          targets.map((t) => ({
            id: t.id,
            values: rollingVolatility(t.returns, meta.trading_days_per_year),
          })),
        ),
      ),
    [dates, targets, meta.trading_days_per_year],
  );

  const sharpeRows = useMemo(
    () =>
      sampleRowsForChart(
        buildRollingChartData(
          dates,
          targets.map((t) => ({
            id: t.id,
            values: rollingSharpe(t.returns, meta.risk_free_rate_annual, meta.trading_days_per_year),
          })),
        ),
      ),
    [dates, targets, meta.risk_free_rate_annual, meta.trading_days_per_year],
  );

  const betaRows = useMemo(
    () =>
      sampleRowsForChart(
        buildRollingChartData(
          dates,
          targets.map((t) => ({
            id: t.id,
            values: rollingBeta(t.returns, marketReturns, meta.trading_days_per_year),
          })),
        ),
      ),
    [dates, targets, marketReturns, meta.trading_days_per_year],
  );

  const series = targets.map((t) => ({ id: t.id, label: t.label, color: t.color }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Rolling Risk Metrics</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Risk isn&apos;t constant. These track the same volatility, Sharpe,
          and beta metrics as above, but recomputed over a trailing{" "}
          {ROLLING_WINDOW_DAYS}-trading-day window that steps forward one day
          at a time — so you can see volatility spike in a crisis, Sharpe
          swing between good and bad stretches, and beta drift as a stock&apos;s
          sensitivity to the market changes, instead of one number averaged
          over everything. The window length is a tradeoff: shorter reacts
          faster to regime changes but gets noisy; longer smooths the noise
          but lags behind turning points. {ROLLING_WINDOW_DAYS} days (~4.5
          months) is a middle ground, not a precisely-tuned optimum. The
          first {ROLLING_WINDOW_DAYS} days after the start date show as a gap
          — the trailing window needs to fill before it can compute anything,
          so that stretch is absent, not zero.
        </p>
      </div>

      <RollingMetricsChart
        title="Rolling Annualized Volatility"
        description={`Trailing ${ROLLING_WINDOW_DAYS}-day standard deviation of daily returns, annualized.`}
        data={volRows}
        series={series}
        yTickFormatter={(v) => formatPct(v, 0)}
        tooltipFormatter={(v) => formatPct(v, 1)}
      />

      <RollingMetricsChart
        title="Rolling Sharpe Ratio"
        description={`Trailing ${ROLLING_WINDOW_DAYS}-day risk-adjusted return vs the ${formatPct(
          meta.risk_free_rate_annual,
          2,
        )} risk-free rate.`}
        data={sharpeRows}
        series={series}
        yTickFormatter={(v) => v.toFixed(1)}
        tooltipFormatter={(v) => v.toFixed(2)}
        referenceLine={{ value: 0, label: "0" }}
      />

      <RollingMetricsChart
        title="Rolling Beta"
        description={`Trailing ${ROLLING_WINDOW_DAYS}-day sensitivity to ${benchmarkName}.`}
        data={betaRows}
        series={series}
        yTickFormatter={(v) => v.toFixed(1)}
        tooltipFormatter={(v) => v.toFixed(2)}
        referenceLine={{ value: 1, label: "1 (market)" }}
      />
    </div>
  );
}
