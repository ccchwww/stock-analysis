"use client";

import { useMemo, useState } from "react";
import type { RiskMeta } from "@/lib/risk-types";
import type { BenchmarkReturns, MarketDataMeta, StockReturns } from "@/lib/market-data-types";
import StockMultiSelect, { type SelectableStock } from "@/components/shared/StockMultiSelect";
import StockPresetButtons from "@/components/shared/StockPresetButtons";
import PortfolioToggle from "@/components/shared/PortfolioToggle";
import StartDateControl from "@/components/shared/StartDateControl";
import { defaultSelection } from "@/lib/stock-presets";
import {
  combineEqualWeight,
  annualizedVolatility,
  sharpeRatio,
  maxDrawdown,
  historicalVaR,
  historicalExpectedShortfall,
  computeBetaAlpha,
  buildCorrelationMatrix,
} from "@/lib/returns-math";
import { sliceFromDate } from "@/lib/date-range";
import { tickerWithName } from "@/lib/ticker-label";
import { colorForTicker } from "@/lib/stock-colors";
import RiskMetricsTable from "./RiskMetricsTable";
import PortfolioRiskSummary, { type PortfolioRiskMetrics } from "./PortfolioRiskSummary";
import CorrelationHeatmap from "./CorrelationHeatmap";
import AssumptionsPanel from "./AssumptionsPanel";
import MonteCarloSection from "./MonteCarloSection";
import RollingMetricsSection, { type RollingTarget } from "./RollingMetricsSection";
import EfficientFrontierSection from "./EfficientFrontierSection";
import { computeEfficientFrontier } from "@/lib/efficient-frontier";

// Distinct from every ticker's hashed hue (see stock-colors.ts's
// RESERVED_HUES) so the blended portfolio line always stands out -- same
// color the Strategies tab uses for its own portfolio line.
const PORTFOLIO_COLOR = "#fbbf24";

export default function RiskDashboard({
  riskMeta,
  marketMeta,
  stocksRaw,
  benchmark,
}: {
  riskMeta: RiskMeta;
  marketMeta: MarketDataMeta;
  stocksRaw: Record<string, StockReturns>;
  benchmark: BenchmarkReturns;
}) {
  const allStocks: SelectableStock[] = useMemo(
    () =>
      marketMeta.tickers_used
        .slice()
        .sort()
        .map((ticker) => ({ ticker, name: stocksRaw[ticker]?.name ?? ticker })),
    [marketMeta.tickers_used, stocksRaw],
  );
  const names = useMemo(
    () => Object.fromEntries(allStocks.map((s) => [s.ticker, s.name])),
    [allStocks],
  );

  const [startDate, setStartDate] = useState(marketMeta.date_range.start);
  const [selectedTickers, setSelectedTickers] = useState<string[]>(() =>
    defaultSelection((t) => Boolean(stocksRaw[t]), allStocks.slice(0, 5).map((s) => s.ticker)),
  );
  const [combine, setCombine] = useState(false);

  const canCombine = selectedTickers.length >= 2;
  const effectiveCombine = combine && canCombine;

  function handleTickersChange(next: string[]) {
    setSelectedTickers(next);
    if (next.length < 2) setCombine(false);
  }

  // Every selected ticker's returns, sliced to the chosen start date -- the
  // single recompute path everything below (table, portfolio blend,
  // correlation, Monte Carlo) reads from.
  const slicedReturnsByTicker = useMemo(() => {
    const out: Record<string, (number | null)[]> = {};
    for (const ticker of selectedTickers) {
      const stock = stocksRaw[ticker];
      if (!stock) continue;
      out[ticker] = sliceFromDate(marketMeta.dates, stock.returns, startDate).series;
    }
    return out;
  }, [selectedTickers, stocksRaw, marketMeta.dates, startDate]);

  // The market benchmark, sliced the same way -- Beta/Alpha always reflect
  // the currently selected start date, same as every other metric here.
  const slicedMarketReturns = useMemo(
    () => sliceFromDate(marketMeta.dates, benchmark.returns, startDate).series,
    [marketMeta.dates, benchmark.returns, startDate],
  );

  // The dates matching every sliced series above -- used to lay out the
  // rolling-metric charts' x-axis.
  const slicedDates = useMemo(
    () => sliceFromDate(marketMeta.dates, marketMeta.dates, startDate).series,
    [marketMeta.dates, startDate],
  );

  const portfolioReturns = useMemo(() => {
    if (!effectiveCombine) return null;
    const series = selectedTickers
      .filter((t) => slicedReturnsByTicker[t])
      .map((t) => ({ id: t, returns: slicedReturnsByTicker[t] }));
    return combineEqualWeight(series);
  }, [effectiveCombine, selectedTickers, slicedReturnsByTicker]);

  const portfolioMetrics: PortfolioRiskMetrics | null = useMemo(() => {
    if (!portfolioReturns) return null;
    const betaAlpha = computeBetaAlpha(
      portfolioReturns,
      slicedMarketReturns,
      riskMeta.risk_free_rate_annual,
      riskMeta.trading_days_per_year,
    );
    return {
      volatility: annualizedVolatility(portfolioReturns, riskMeta.trading_days_per_year),
      sharpe: sharpeRatio(portfolioReturns, riskMeta.risk_free_rate_annual, riskMeta.trading_days_per_year),
      maxDrawdown: maxDrawdown(portfolioReturns),
      var95: historicalVaR(portfolioReturns, riskMeta.var_confidence),
      es95: historicalExpectedShortfall(portfolioReturns, riskMeta.var_confidence),
      beta: betaAlpha?.beta ?? null,
      alpha: betaAlpha?.alpha ?? null,
    };
  }, [portfolioReturns, slicedMarketReturns, riskMeta]);

  // Same "portfolio if combining, else one line per selected stock" split as
  // the static metrics above (RiskMetricsTable / PortfolioRiskSummary), so
  // the rolling charts stay consistent with what's already on the page.
  const rollingTargets: RollingTarget[] = useMemo(() => {
    if (effectiveCombine && portfolioReturns) {
      return [
        {
          id: "portfolio",
          label: `Portfolio (${selectedTickers.length} stocks, equal-weight)`,
          color: PORTFOLIO_COLOR,
          returns: portfolioReturns,
        },
      ];
    }
    return selectedTickers
      .filter((ticker) => slicedReturnsByTicker[ticker])
      .map((ticker) => ({
        id: ticker,
        label: tickerWithName(ticker, names[ticker]),
        color: colorForTicker(ticker),
        returns: slicedReturnsByTicker[ticker],
      }));
  }, [effectiveCombine, portfolioReturns, selectedTickers, slicedReturnsByTicker, names]);

  const correlationMatrix = useMemo(() => {
    if (selectedTickers.length < 2) return null;
    return buildCorrelationMatrix(selectedTickers, slicedReturnsByTicker);
  }, [selectedTickers, slicedReturnsByTicker]);

  // Always over the full selected set, regardless of the "combine as
  // portfolio" toggle -- that toggle only picks which single blended line
  // the OTHER sections display, whereas the frontier's entire point is to
  // consider every long-only combination of the selected stocks at once.
  const efficientFrontier = useMemo(
    () =>
      computeEfficientFrontier({
        tickers: selectedTickers,
        returnsByTicker: slicedReturnsByTicker,
        riskFreeRateAnnual: riskMeta.risk_free_rate_annual,
        tradingDays: riskMeta.trading_days_per_year,
      }),
    [selectedTickers, slicedReturnsByTicker, riskMeta.risk_free_rate_annual, riskMeta.trading_days_per_year],
  );

  // Monte Carlo runs on ONE clear target: the blended portfolio if combining
  // 2+ stocks, or a single selected stock. Ambiguous otherwise (multiple
  // stocks, not combined) -- there's no single "$ amount invested" target in
  // that case, so the section prompts the user to combine or narrow instead.
  const monteCarloTarget = useMemo(() => {
    if (effectiveCombine) {
      const seriesList = selectedTickers
        .filter((t) => slicedReturnsByTicker[t])
        .map((t) => slicedReturnsByTicker[t]);
      if (seriesList.length < 2) return null;
      return {
        label: `Portfolio (${seriesList.length} stocks, equal-weight)`,
        seriesList,
        weights: seriesList.map(() => 1 / seriesList.length),
      };
    }
    if (selectedTickers.length === 1) {
      const ticker = selectedTickers[0];
      const series = slicedReturnsByTicker[ticker];
      if (!series) return null;
      return {
        label: tickerWithName(ticker, names[ticker]),
        seriesList: [series],
        weights: [1],
      };
    }
    return null;
  }, [effectiveCombine, selectedTickers, slicedReturnsByTicker, names]);

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-start">
          <StockMultiSelect
            stocks={allStocks}
            selected={selectedTickers}
            onChange={handleTickersChange}
          />
          <PortfolioToggle
            checked={combine}
            onChange={setCombine}
            disabled={!canCombine}
            hint={canCombine ? "equal-weight" : "select 2+ stocks"}
          />
          <StartDateControl
            value={startDate}
            min={marketMeta.date_range.start}
            max={marketMeta.date_range.end}
            onChange={setStartDate}
          />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <StockPresetButtons
            selected={selectedTickers}
            onChange={handleTickersChange}
            available={(t) => Boolean(stocksRaw[t])}
          />
        </div>
      </div>

      {effectiveCombine && portfolioMetrics ? (
        <PortfolioRiskSummary
          metrics={portfolioMetrics}
          numStocks={selectedTickers.length}
          meta={riskMeta}
        />
      ) : selectedTickers.length > 0 ? (
        <RiskMetricsTable
          tickers={selectedTickers}
          returnsByTicker={slicedReturnsByTicker}
          marketReturns={slicedMarketReturns}
          names={names}
          meta={riskMeta}
        />
      ) : (
        <p className="text-sm text-zinc-500">
          Select one or more stocks above to see their risk metrics.
        </p>
      )}

      <RollingMetricsSection
        dates={slicedDates}
        targets={rollingTargets}
        marketReturns={slicedMarketReturns}
        meta={riskMeta}
      />

      <CorrelationHeatmap tickers={selectedTickers} matrix={correlationMatrix} names={names} />

      <EfficientFrontierSection tickers={selectedTickers} names={names} result={efficientFrontier} />

      {monteCarloTarget ? (
        <MonteCarloSection
          targetLabel={monteCarloTarget.label}
          seriesList={monteCarloTarget.seriesList}
          weights={monteCarloTarget.weights}
        />
      ) : (
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-foreground">Expected Outcome (Monte Carlo)</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Select exactly one stock, or enable &ldquo;combine as portfolio&rdquo;
            with 2+ stocks selected, to project an expected outcome.
          </p>
        </div>
      )}

      <AssumptionsPanel meta={riskMeta} benchmarkName={benchmark.name} />
    </div>
  );
}
