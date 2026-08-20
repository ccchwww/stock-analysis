import { getResults } from "@/lib/results";
import { getMarketData } from "@/lib/market-data-results";
import StrategyExplorer from "@/components/strategies/StrategyExplorer";

export const metadata = {
  title: "Strategies · Quant Lab",
};

export default async function StrategiesPage() {
  const [{ meta, strategies }, marketData] = await Promise.all([
    getResults(),
    getMarketData(),
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
          → {meta.date_range.end}), each measured against an equal-weight Buy
          &amp; Hold benchmark.
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
      />
    </div>
  );
}
