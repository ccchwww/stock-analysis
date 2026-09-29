"use client";

import { useMemo, useState } from "react";
import type { ResultsMeta, StrategyResult } from "@/lib/types";
import type { MarketDataMeta, StockReturns, IndexBenchmark } from "@/lib/market-data-types";
import type { RiskMeta } from "@/lib/risk-types";
import type { PerformanceRow } from "@/lib/risk-adjusted";
import { colorForStrategy } from "@/lib/strategy-colors";
import { colorForTicker } from "@/lib/stock-colors";
import {
  buildBenchmarkOptions,
  colorForBenchmark,
  dashForBenchmark,
  defaultBenchmarkValue,
  keysForBenchmarkValue,
} from "@/lib/benchmarks";
import {
  MAX_SEARCH_BPS,
  costScenarioLevels,
  solveBreakEvenBps,
  totalReturnAtCost,
} from "@/lib/cost-model";
import { computeRiskAdjustedRow } from "@/lib/risk-adjusted";
import { sliceFromDate } from "@/lib/date-range";
import { computeDerivedStats, type DerivedStats } from "@/lib/derived-stats";
import { combineEqualWeight } from "@/lib/returns-math";
import { computeVerdict, getBestStrategy, isSelectionStrategy } from "@/lib/verdict";
import { formatSignedPct, toneOf } from "@/lib/format";
import StatCard from "@/components/shared/StatCard";
import StockMultiSelect, { type SelectableStock } from "@/components/shared/StockMultiSelect";
import StockPresetButtons from "@/components/shared/StockPresetButtons";
import PortfolioToggle from "@/components/shared/PortfolioToggle";
import StartDateControl from "@/components/shared/StartDateControl";
import EquityChart, { type ChartSeries } from "./EquityChart";
import StrategyMultiSelect from "./StrategyMultiSelect";
import BenchmarkPicker from "./BenchmarkPicker";
import ComparisonTable from "./ComparisonTable";
import RiskMetricsTable from "./RiskMetricsTable";
import CostSensitivity, { type CostRow } from "./CostSensitivity";
import LowVolExplainer from "./LowVolExplainer";
import VerdictBanner from "./VerdictBanner";
import PortfolioSummary from "./PortfolioSummary";
import StockStatsTable from "./StockStatsTable";

// Distinct from every strategy/ticker hue so the blended line always stands out.
const PORTFOLIO_COLOR = "#fbbf24";
const PORTFOLIO_ID = "__portfolio__";
const BENCHMARK_ID = "buy_hold";
const LOW_VOL_ID = "low_vol";

/** Index-benchmark row ids are namespaced so they can never collide with a
 *  strategy id, a ticker, or the portfolio blend in the chart's merged data. */
function benchmarkRowId(key: string): string {
  return `benchmark:${key}`;
}

export default function StrategyExplorer({
  resultsMeta,
  strategiesRaw,
  marketMeta,
  stocksRaw,
  indexBenchmarks,
  riskMeta,
}: {
  resultsMeta: ResultsMeta;
  strategiesRaw: Record<string, StrategyResult>;
  marketMeta: MarketDataMeta;
  stocksRaw: Record<string, StockReturns>;
  indexBenchmarks: Record<string, IndexBenchmark>;
  riskMeta: RiskMeta;
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

  const benchmarkOptions = useMemo(
    () => buildBenchmarkOptions(indexBenchmarks),
    [indexBenchmarks],
  );

  const [startDate, setStartDate] = useState(resultsMeta.date_range.start);
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<string[]>(strategyOrder);
  const [benchmarkValue, setBenchmarkValue] = useState(() =>
    defaultBenchmarkValue(indexBenchmarks),
  );
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [combinePortfolio, setCombinePortfolio] = useState(false);

  const canCombine = selectedTickers.length >= 2;
  const effectiveCombine = combinePortfolio && canCombine;

  function handleTickersChange(next: string[]) {
    setSelectedTickers(next);
    if (next.length < 2) setCombinePortfolio(false);
  }

  // Every strategy as a scorable row, recomputed for the current start date --
  // always the full roster (the tables and verdict compare all of them
  // regardless of which lines are toggled onto the chart).
  const strategyRows: PerformanceRow[] = useMemo(() => {
    const rows: PerformanceRow[] = [];
    for (const id of strategyOrder) {
      const strategy = strategiesRaw[id];
      if (!strategy) continue;
      const sliced = sliceFromDate(resultsMeta.dates, strategy.daily_returns, startDate);
      const slicedTurnover = sliceFromDate(
        resultsMeta.dates,
        strategy.daily_turnover,
        startDate,
      ).series;
      rows.push({
        id,
        label: strategy.label,
        description: strategy.description,
        kind: "strategy",
        color: colorForStrategy(id),
        dash: id === BENCHMARK_ID ? "4 3" : undefined,
        stats: computeDerivedStats(
          strategy,
          sliced.dates,
          sliced.series,
          resultsMeta.initial_capital,
        ),
        slicedReturns: sliced.series,
        slicedTurnover,
      });
    }
    return rows;
  }, [strategyOrder, strategiesRaw, resultsMeta.dates, resultsMeta.initial_capital, startDate]);

  const activeBenchmarkKeys = useMemo(
    () => keysForBenchmarkValue(benchmarkOptions, benchmarkValue),
    [benchmarkOptions, benchmarkValue],
  );

  // Passive benchmarks go through the IDENTICAL slice + computeDerivedStats
  // path as a strategy, so their numbers cannot diverge by being computed a
  // second way. They carry no turnover: no strategy trading applies to them,
  // and the strategies' transaction costs are never charged against them.
  const benchmarkRows: PerformanceRow[] = useMemo(() => {
    const rows: PerformanceRow[] = [];
    for (const key of activeBenchmarkKeys) {
      const benchmark = indexBenchmarks[key];
      if (!benchmark) continue;
      const id = benchmarkRowId(key);
      const sliced = sliceFromDate(marketMeta.dates, benchmark.returns, startDate);
      rows.push({
        id,
        label: benchmark.label,
        description: benchmark.description,
        kind: "benchmark",
        color: colorForBenchmark(key),
        dash: dashForBenchmark(key),
        stats: computeDerivedStats(
          { id, label: benchmark.label, description: benchmark.description },
          sliced.dates,
          sliced.series,
          resultsMeta.initial_capital,
        ),
        slicedReturns: sliced.series,
        slicedTurnover: null,
      });
    }
    return rows;
  }, [
    activeBenchmarkKeys,
    indexBenchmarks,
    marketMeta.dates,
    resultsMeta.initial_capital,
    startDate,
  ]);

  const allRows = useMemo(
    () => [...strategyRows, ...benchmarkRows],
    [strategyRows, benchmarkRows],
  );

  const colorById = useMemo(
    () => Object.fromEntries(allRows.map((r) => [r.id, r.color])),
    [allRows],
  );

  const riskAdjustedRows = useMemo(
    () =>
      allRows.map((row) =>
        computeRiskAdjustedRow(
          row,
          riskMeta.risk_free_rate_annual,
          riskMeta.trading_days_per_year,
        ),
      ),
    [allRows, riskMeta.risk_free_rate_annual, riskMeta.trading_days_per_year],
  );

  // --- Cost sensitivity -------------------------------------------------
  const costLevels = useMemo(
    () => costScenarioLevels(resultsMeta.cost_bps),
    [resultsMeta.cost_bps],
  );

  const costRows: CostRow[] = useMemo(() => {
    const benchmarkStrategy = strategiesRaw[BENCHMARK_ID];
    if (!benchmarkStrategy) return [];

    const benchmarkSliced = sliceFromDate(
      resultsMeta.dates,
      benchmarkStrategy.daily_returns,
      startDate,
    );
    const benchmarkTurnover = sliceFromDate(
      resultsMeta.dates,
      benchmarkStrategy.daily_turnover,
      startDate,
    ).series;

    return strategyOrder.flatMap((id) => {
      const strategy = strategiesRaw[id];
      if (!strategy) return [];
      const sliced = sliceFromDate(resultsMeta.dates, strategy.daily_returns, startDate);
      const turnover = sliceFromDate(
        resultsMeta.dates,
        strategy.daily_turnover,
        startDate,
      ).series;

      const totalReturns = costLevels.map((bps) =>
        totalReturnAtCost({
          dates: sliced.dates,
          netReturns: sliced.series,
          turnover,
          baseCostBps: resultsMeta.cost_bps,
          newCostBps: bps,
          initialCapital: resultsMeta.initial_capital,
        }),
      );

      const isBenchmarkStrategy = id === BENCHMARK_ID;
      return [
        {
          id,
          label: strategy.label,
          color: colorForStrategy(id),
          totalReturns,
          isBenchmarkStrategy,
          breakEven: isBenchmarkStrategy
            ? ({ kind: "unavailable" } as const)
            : solveBreakEvenBps({
                dates: sliced.dates,
                netReturns: sliced.series,
                turnover,
                benchmarkReturns: benchmarkSliced.series,
                benchmarkTurnover,
                baseCostBps: resultsMeta.cost_bps,
                initialCapital: resultsMeta.initial_capital,
              }),
        },
      ];
    });
  }, [
    strategyOrder,
    strategiesRaw,
    resultsMeta.dates,
    resultsMeta.cost_bps,
    resultsMeta.initial_capital,
    costLevels,
    startDate,
  ]);

  // --- Stock / portfolio overlays (unchanged behaviour) -----------------
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
    const selected = new Set(selectedStrategyIds);

    for (const row of strategyRows) {
      if (!selected.has(row.id) || row.stats.chartCurve.length === 0) continue;
      result.push({
        id: row.id,
        label: row.label,
        color: row.color,
        equityCurve: row.stats.chartCurve,
        dashArray: row.dash,
        strokeWidth: row.id === BENCHMARK_ID ? 1.5 : 2,
      });
    }

    // Benchmarks are driven by their own picker, not the strategy toggles --
    // they are the frame of reference, not one of the things being compared.
    for (const row of benchmarkRows) {
      if (row.stats.chartCurve.length === 0) continue;
      result.push({
        id: row.id,
        label: row.label,
        color: row.color,
        equityCurve: row.stats.chartCurve,
        dashArray: row.dash,
        strokeWidth: 1.5,
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
  }, [
    selectedStrategyIds,
    strategyRows,
    benchmarkRows,
    effectiveCombine,
    portfolioStats,
    selectedTickers,
    stockStats,
  ]);

  const strategyStats: Record<string, DerivedStats> = useMemo(
    () => Object.fromEntries(strategyRows.map((r) => [r.id, r.stats])),
    [strategyRows],
  );

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

  const lowVol = strategiesRaw[LOW_VOL_ID];

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
        <div className="mt-4 border-t border-border pt-4">
          <BenchmarkPicker
            options={benchmarkOptions}
            value={benchmarkValue}
            onChange={setBenchmarkValue}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Best Active Strategy"
          value={bestActive?.totalReturn != null ? formatSignedPct(bestActive.totalReturn, 1) : "n/a"}
          tone={bestActive?.totalReturn != null ? toneOf(bestActive.totalReturn) : "neutral"}
          caption={bestActive?.label ?? "insufficient data in window"}
          explanation={
            bestActive && isSelectionStrategy(bestActive.id)
              ? "Overstated by an unknown amount: this strategy ranks and buys from today's TSX 60 list applied backwards, a universe already filtered for survival. See the survivorship caveat below."
              : undefined
          }
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
          explanation={
            bestActive && isSelectionStrategy(bestActive.id)
              ? "Not a reliable estimate of edge. Survivorship bias inflates a selection strategy more than it inflates Buy & Hold, so this gap is overstated by an unknown amount."
              : undefined
          }
        />
        <StatCard
          label="Strategies Tested"
          value={String(strategyOrder.length)}
          caption={`${resultsMeta.num_tickers} tickers · from ${startDate}`}
        />
      </div>

      <EquityChart series={chartSeries} />

      <div className="rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-zinc-400">
        <p>
          <span className="font-medium text-zinc-200">
            Two different benchmarks, two different questions.
          </span>{" "}
          Buy &amp; Hold is an equal-weight basket of the same {resultsMeta.num_tickers} stocks
          the strategies pick from — it asks whether the picking rules beat holding the same
          names. An index benchmark is what a passive investor would actually hold instead —
          it asks whether any of this was worth doing at all.
        </p>
        <p className="mt-2">
          Index lines are <span className="text-zinc-200">ETF total returns in Canadian
          dollars</span>, taken from dividend-adjusted closes, so they are net of each
          fund&rsquo;s management fee (MER) and directly comparable to the dividend-inclusive
          stock returns used everywhere else. The S&amp;P 500 line is unhedged, so it includes
          USD/CAD currency moves as well as the US market&rsquo;s own return — part of the gap
          it shows is the exchange rate, not the index. No strategy transaction cost is charged
          against a benchmark; they are held, not traded.
        </p>
      </div>

      <ComparisonTable rows={allRows} />

      {verdict && <VerdictBanner verdict={verdict} />}

      <RiskMetricsTable
        rows={allRows}
        metrics={riskAdjustedRows}
        colorById={colorById}
        riskFreeRateAnnual={riskMeta.risk_free_rate_annual}
        tradingDays={riskMeta.trading_days_per_year}
        startDate={startDate}
      />

      <CostSensitivity
        rows={costRows}
        levels={costLevels}
        defaultBps={resultsMeta.cost_bps}
        maxSearchBps={MAX_SEARCH_BPS}
        startDate={startDate}
        benchmarkLabel={strategiesRaw[BENCHMARK_ID]?.label ?? "Buy & Hold"}
      />

      {lowVol && (
        <LowVolExplainer
          lookbackDays={resultsMeta.low_vol_lookback_days}
          topN={resultsMeta.top_n}
          minCoverageFraction={resultsMeta.low_vol_min_coverage_fraction}
          holdings={resultsMeta.low_vol_holdings}
        />
      )}

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
