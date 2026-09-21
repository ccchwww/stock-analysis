"use client";

import { useMemo, useState } from "react";
import type { ValidationMeta, StressMeta } from "@/lib/validation-types";
import type { MarketDataMeta, StockReturns } from "@/lib/market-data-types";
import type { StressDataMeta, StressStockReturns, StressBenchmarkReturns } from "@/lib/stress-data-types";
import type { RiskMeta } from "@/lib/risk-types";
import StockMultiSelect, { type SelectableStock } from "@/components/shared/StockMultiSelect";
import StockPresetButtons from "@/components/shared/StockPresetButtons";
import PortfolioToggle from "@/components/shared/PortfolioToggle";
import StartDateControl from "@/components/shared/StartDateControl";
import { defaultSelection } from "@/lib/stock-presets";
import { combineEqualWeight } from "@/lib/returns-math";
import { tickerWithName } from "@/lib/ticker-label";
import { earliestBacktestableDate, computeVarBacktest } from "@/lib/var-backtest";
import VarBacktestSection from "./VarBacktestSection";
import StressTestSection from "./StressTestSection";

export default function ModelValidationDashboard({
  validationMeta,
  stressConfig,
  marketMeta,
  stocksRaw,
  stressDataMeta,
  stressStocksRaw,
  stressBenchmark,
  riskMeta,
}: {
  validationMeta: ValidationMeta;
  stressConfig: StressMeta;
  marketMeta: MarketDataMeta;
  stocksRaw: Record<string, StockReturns>;
  stressDataMeta: StressDataMeta;
  stressStocksRaw: Record<string, StressStockReturns>;
  stressBenchmark: StressBenchmarkReturns;
  riskMeta: RiskMeta;
}) {
  const allStocks: SelectableStock[] = useMemo(
    () =>
      marketMeta.tickers_used
        .slice()
        .sort()
        .map((ticker) => ({ ticker, name: stocksRaw[ticker]?.name ?? ticker })),
    [marketMeta.tickers_used, stocksRaw],
  );
  const names = useMemo(() => Object.fromEntries(allStocks.map((s) => [s.ticker, s.name])), [allStocks]);

  // The start-date control's floor -- picking anything earlier isn't
  // possible, so the 250-day warmup the backtest needs is always available
  // rather than being silently shortened. Only the VaR backtest (Part 1)
  // reads this -- the stress tests (Part 2) use fixed historical windows,
  // entirely independent of this control.
  const earliestStart = useMemo(
    () => earliestBacktestableDate(marketMeta.dates, validationMeta.var_window_days),
    [marketMeta.dates, validationMeta.var_window_days],
  );

  const [startDate, setStartDate] = useState(earliestStart);
  const [selectedTickers, setSelectedTickers] = useState<string[]>(() =>
    defaultSelection((t) => Boolean(stocksRaw[t]), allStocks.slice(0, 5).map((s) => s.ticker)),
  );
  // Defaults to ON (unlike the other tabs, which default off) so this tab
  // shows a working backtest immediately on load instead of the "select a
  // stock or combine" prompt -- the primary chart here is meant to be the
  // screenshot that represents this project, so it shouldn't start blank.
  const [combine, setCombine] = useState(true);

  const canCombine = selectedTickers.length >= 2;
  const effectiveCombine = combine && canCombine;

  function handleTickersChange(next: string[]) {
    setSelectedTickers(next);
    if (next.length < 2) setCombine(false);
  }

  // FULL (unsliced) returns for whichever target is active -- var-backtest's
  // computeVarBacktest needs the entire history to reach back for its own
  // 250-day warmup, and does its own slicing internally once given a start
  // date. Pre-slicing here (like the Risk Dashboard does for ITS metrics)
  // would cut off exactly the pre-start-date history the warmup needs.
  const target = useMemo(() => {
    if (effectiveCombine) {
      const series = selectedTickers
        .filter((t) => stocksRaw[t])
        .map((t) => ({ id: t, returns: stocksRaw[t].returns }));
      if (series.length < 2) return null;
      return {
        label: `Portfolio (${series.length} stocks, equal-weight)`,
        returns: combineEqualWeight(series),
      };
    }
    if (selectedTickers.length === 1) {
      const ticker = selectedTickers[0];
      const stock = stocksRaw[ticker];
      if (!stock) return null;
      return { label: tickerWithName(ticker, names[ticker]), returns: stock.returns };
    }
    return null;
  }, [effectiveCombine, selectedTickers, stocksRaw, names]);

  const result = useMemo(() => {
    if (!target) return null;
    return computeVarBacktest({ dates: marketMeta.dates, returns: target.returns, startDate });
  }, [target, marketMeta.dates, startDate]);

  // Stress testing (Part 2) works directly off the shared selection (NOT
  // the combine toggle or start date, which only shape Part 1's target) --
  // it always shows every selected stock individually plus the various
  // portfolio constructions at once, closer to how the Efficient Frontier
  // section on the Risk Dashboard always uses the full selection regardless
  // of "combine".
  const stressReturnsByTicker = useMemo(() => {
    const out: Record<string, (number | null)[]> = {};
    for (const ticker of Object.keys(stressStocksRaw)) out[ticker] = stressStocksRaw[ticker].returns;
    return out;
  }, [stressStocksRaw]);

  const stressSelectedTickers = useMemo(
    () => selectedTickers.filter((t) => stressStocksRaw[t]),
    [selectedTickers, stressStocksRaw],
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-start">
          <StockMultiSelect stocks={allStocks} selected={selectedTickers} onChange={handleTickersChange} />
          <PortfolioToggle
            checked={combine}
            onChange={setCombine}
            disabled={!canCombine}
            hint={canCombine ? "equal-weight" : "select 2+ stocks"}
          />
          <StartDateControl value={startDate} min={earliestStart} max={marketMeta.date_range.end} onChange={setStartDate} />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <StockPresetButtons
            selected={selectedTickers}
            onChange={handleTickersChange}
            available={(t) => Boolean(stocksRaw[t])}
          />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Earliest selectable start date is {earliestStart} — {validationMeta.var_window_days} trading days
          before it are required to seed the rolling VaR window, so the backtest never silently runs on a
          shorter sample than your chosen start date implies. This control only affects the VaR backtest below
          — the stress-test windows further down use fixed historical dates and ignore it entirely.
        </p>
      </div>

      {target && result ? (
        <VarBacktestSection targetLabel={target.label} result={result} validationMeta={validationMeta} />
      ) : (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="text-sm text-zinc-500">
            Select exactly one stock, or enable &ldquo;combine as portfolio&rdquo; with 2+ stocks selected, to
            run the VaR backtest.
          </p>
        </div>
      )}

      <StressTestSection
        tickers={stressSelectedTickers}
        names={names}
        dates={stressDataMeta.dates}
        returnsByTicker={stressReturnsByTicker}
        benchmarkReturns={stressBenchmark.returns}
        stressConfig={stressConfig}
        riskFreeRateAnnual={riskMeta.risk_free_rate_annual}
        tradingDays={riskMeta.trading_days_per_year}
      />
    </div>
  );
}
