"use client";

import { useMemo, useState } from "react";
import type { ResultsMeta, StrategyResult } from "@/lib/types";
import type { MarketDataMeta, StockReturns } from "@/lib/market-data-types";
import { colorForStrategy } from "@/lib/strategy-colors";
import { colorForTicker } from "@/lib/stock-colors";
import { sliceFromDate } from "@/lib/date-range";
import { computeDerivedStats, type DerivedStats } from "@/lib/derived-stats";
import { combineEqualWeight } from "@/lib/returns-math";
import { computeVerdict, getBestStrategy } from "@/lib/verdict";
import { formatSignedPct, toneOf } from "@/lib/format";
import StatCard from "@/components/shared/StatCard";
import StockMultiSelect, { type SelectableStock } from "@/components/shared/StockMultiSelect";
import PortfolioToggle from "@/components/shared/PortfolioToggle";
import StartDateControl from "@/components/shared/StartDateControl";
import EquityChart, { type ChartSeries } from "./EquityChart";
import StrategyMultiSelect from "./StrategyMultiSelect";
import ComparisonTable from "./ComparisonTable";
import VerdictBanner from "./VerdictBanner";
import PortfolioSummary from "./PortfolioSummary";
import StockStatsTable from "./StockStatsTable";

// Distinct from every strategy/ticker hue so the blended line always stands out.
const PORTFOLIO_COLOR = "#fbbf24";
const PORTFOLIO_ID = "__portfolio__";
const BENCHMARK_ID = "buy_hold";

export default function StrategyExplorer({
  resultsMeta,
  strategiesRaw,
  marketMeta,
  stocksRaw,
}: {
  resultsMeta: ResultsMeta;
  strategiesRaw: Record<string, StrategyResult>;
  marketMeta: MarketDataMeta;
  stocksRaw: Record<string, StockReturns>;
}) {
  const strategyOrder = resultsMeta.strategy_order;

  const allStocks: SelectableStock[] = useMemo(
    () =>
      marketMeta.tickers_used
        .slice()
        .sort()
        .map((ticker) => ({ ticker, name: stocksRaw[ticker]?.name ?? ticker })),
    [marketMeta.tickers_used, stocksRaw],
  );

  const [startDate, setStartDate] = useState(resultsMeta.date_range.start);
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<string[]>(strategyOrder);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [combinePortfolio, setCombinePortfolio] = useState(false);

  const canCombine = selectedTickers.length >= 2;
  const effectiveCombine = combinePortfolio && canCombine;

  function handleTickersChange(next: string[]) {
    setSelectedTickers(next);
    if (next.length < 2) setCombinePortfolio(false);
  }

  // Every strategy's stats, recomputed for the current start date -- always
  // all 4 (the ComparisonTable/verdict compare the full roster regardless
  // of which lines are toggled onto the chart).
  const strategyStats: Record<string, DerivedStats> = useMemo(() => {
    const out: Record<string, DerivedStats> = {};
    for (const id of strategyOrder) {
      const strategy = strategiesRaw[id];
      if (!strategy) continue;
      const sliced = sliceFromDate(resultsMeta.dates, strategy.daily_returns, startDate);
      out[id] = computeDerivedStats(strategy, sliced.dates, sliced.series, resultsMeta.initial_capital);
    }
    return out;
  }, [strategyOrder, strategiesRaw, resultsMeta.dates, resultsMeta.initial_capital, startDate]);

  // Each selected stock's stats, recomputed for the current start date.
  const stockStats: Record<string, DerivedStats> = useMemo(() => {
    const out: Record<string, DerivedStats> = {};
    for (const ticker of selectedTickers) {
      const stock = stocksRaw[ticker];
      if (!stock) continue;
      const sliced = sliceFromDate(marketMeta.dates, stock.returns, startDate);
      out[ticker] = computeDerivedStats(
        { id: ticker, label: ticker },
        sliced.dates,
        sliced.series,
        resultsMeta.initial_capital,
      );
    }
    return out;
  }, [selectedTickers, stocksRaw, marketMeta.dates, resultsMeta.initial_capital, startDate]);

  const portfolioStats: DerivedStats | null = useMemo(() => {
    if (!effectiveCombine) return null;
    const sliced = selectedTickers.map((ticker) =>
      sliceFromDate(marketMeta.dates, stocksRaw[ticker].returns, startDate),
    );
    // All selected stocks share market_data's date grid, so any slice's
    // dates array is a valid reference for the blend's own date grid.
    const blendDates = sliced[0]?.dates ?? [];
    const blendedReturns = combineEqualWeight(
      selectedTickers.map((ticker, i) => ({ id: ticker, returns: sliced[i].series })),
    );
    return computeDerivedStats(
      { id: PORTFOLIO_ID, label: `Portfolio (equal-weight, ${selectedTickers.length} stocks)` },
      blendDates,
      blendedReturns,
      resultsMeta.initial_capital,
    );
  }, [effectiveCombine, selectedTickers, stocksRaw, marketMeta.dates, resultsMeta.initial_capital, startDate]);

  const chartSeries: ChartSeries[] = useMemo(() => {
    const result: ChartSeries[] = [];

    for (const id of selectedStrategyIds) {
      const stats = strategyStats[id];
      const strategy = strategiesRaw[id];
      if (!stats || !strategy || stats.chartCurve.length === 0) continue;
      result.push({
        id,
        label: strategy.label,
        color: colorForStrategy(id),
        equityCurve: stats.chartCurve,
        dashed: id === BENCHMARK_ID,
        strokeWidth: id === BENCHMARK_ID ? 1.5 : 2,
      });
    }

    if (effectiveCombine && portfolioStats && portfolioStats.chartCurve.length > 0) {
      result.push({
        id: PORTFOLIO_ID,
        label: portfolioStats.label,
        color: PORTFOLIO_COLOR,
        equityCurve: portfolioStats.chartCurve,
        strokeWidth: 3,
      });
    } else {
      for (const ticker of selectedTickers) {
        const stats = stockStats[ticker];
        if (!stats || stats.chartCurve.length === 0) continue;
        result.push({
          id: ticker,
          label: ticker,
          color: colorForTicker(ticker),
          equityCurve: stats.chartCurve,
          strokeWidth: 1.5,
        });
      }
    }

    return result;
  }, [selectedStrategyIds, strategyStats, strategiesRaw, effectiveCombine, portfolioStats, selectedTickers, stockStats]);

  const verdict = useMemo(
    () => computeVerdict(strategyStats, strategyOrder, resultsMeta.cost_bps),
    [strategyStats, strategyOrder, resultsMeta.cost_bps],
  );
  const benchmark = strategyStats[BENCHMARK_ID] ?? null;
  const bestActive = useMemo(
    () => getBestStrategy(strategyStats, strategyOrder.filter((id) => id !== BENCHMARK_ID)),
    [strategyStats, strategyOrder],
  );
  const edgeVsBenchmark =
    bestActive?.totalReturn !== null && bestActive?.totalReturn !== undefined &&
    benchmark?.totalReturn !== null && benchmark?.totalReturn !== undefined
      ? bestActive.totalReturn - benchmark.totalReturn
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,auto)_minmax(240px,1fr)_auto_auto] lg:items-start">
          <StrategyMultiSelect
            strategies={strategiesRaw}
            order={strategyOrder}
            selected={selectedStrategyIds}
            onChange={setSelectedStrategyIds}
          />
          <StockMultiSelect
            stocks={allStocks}
            selected={selectedTickers}
            onChange={handleTickersChange}
          />
          <PortfolioToggle
            checked={combinePortfolio}
            onChange={setCombinePortfolio}
            disabled={!canCombine}
            hint={canCombine ? "equal-weight" : "select 2+ stocks"}
          />
          <StartDateControl
            value={startDate}
            min={resultsMeta.date_range.start}
            max={resultsMeta.date_range.end}
            onChange={setStartDate}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Best Active Strategy"
          value={bestActive?.totalReturn != null ? formatSignedPct(bestActive.totalReturn, 1) : "n/a"}
          tone={bestActive?.totalReturn != null ? toneOf(bestActive.totalReturn) : "neutral"}
          caption={bestActive?.label ?? "insufficient data in window"}
        />
        <StatCard
          label="Buy & Hold (Benchmark)"
          value={benchmark?.totalReturn != null ? formatSignedPct(benchmark.totalReturn, 1) : "n/a"}
          tone={benchmark?.totalReturn != null ? toneOf(benchmark.totalReturn) : "neutral"}
          caption={
            benchmark?.finalValue != null
              ? `$${benchmark.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} final value`
              : "insufficient data in window"
          }
        />
        <StatCard
          label="Best Active vs Benchmark"
          value={edgeVsBenchmark != null ? formatSignedPct(edgeVsBenchmark, 1) : "n/a"}
          tone={edgeVsBenchmark != null ? toneOf(edgeVsBenchmark) : "neutral"}
          caption="percentage points, total return, net of costs"
        />
        <StatCard
          label="Strategies Tested"
          value={String(strategyOrder.length)}
          caption={`${resultsMeta.num_tickers} tickers · from ${startDate}`}
        />
      </div>

      <EquityChart series={chartSeries} />

      <ComparisonTable strategies={strategyStats} order={strategyOrder} />

      {verdict && <VerdictBanner verdict={verdict} />}

      {effectiveCombine && portfolioStats && (
        <PortfolioSummary summary={portfolioStats} numStocks={selectedTickers.length} />
      )}

      {!effectiveCombine && selectedTickers.length > 0 && (
        <StockStatsTable
          tickers={selectedTickers}
          stats={stockStats}
          names={Object.fromEntries(allStocks.map((s) => [s.ticker, s.name]))}
        />
      )}
    </div>
  );
}
