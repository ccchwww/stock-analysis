import { getResults } from "@/lib/results";
import { getMarketData } from "@/lib/market-data-results";
import { getRiskData } from "@/lib/risk-results";
import StrategyExplorer from "@/components/strategies/StrategyExplorer";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Strategies");

export default async function StrategiesPage() {
  // risk.json supplies the risk-free rate and annualization convention, so
  // Sharpe here is the same calculation as Sharpe on the Risk Dashboard
  // rather than a second constant that could drift from it.
  const [{ meta, strategies }, marketData, riskData] = await Promise.all([
    getResults(),
    getMarketData(),
    getRiskData(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Strategy Comparison
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Comparing {meta.strategy_order.length} strategies across{" "}
          {meta.num_tickers} Canadian large-cap tickers ({meta.date_range.start}{" "}
          → {meta.date_range.end}), measured against both an equal-weight Buy
          &amp; Hold of the same names and{" "}
          {Object.keys(marketData.index_benchmarks).length} passive index ETF
          benchmarks in Canadian dollars.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-zinc-400">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          {meta.cost_note}
        </div>
      </div>

      <StrategyExplorer
        resultsMeta={meta}
        strategiesRaw={strategies}
        marketMeta={marketData.meta}
        stocksRaw={marketData.stocks}
        indexBenchmarks={marketData.index_benchmarks}
        riskMeta={riskData.meta}
      />
    </div>
  );
}
