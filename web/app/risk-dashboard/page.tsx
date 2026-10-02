import { getRiskData } from "@/lib/risk-results";
import { getMarketData } from "@/lib/market-data-results";
import RiskDashboard from "@/components/risk/RiskDashboard";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Risk Dashboard");

export default async function RiskDashboardPage() {
  const [riskData, marketData] = await Promise.all([getRiskData(), getMarketData()]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Risk Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Volatility, risk-adjusted return, drawdown, and tail-risk metrics
          for any combination of {marketData.meta.num_tickers} TSX 60 stocks (
          {marketData.meta.date_range.start} → {marketData.meta.date_range.end}
          ) — plus how correlated your picks really are and a Monte Carlo
          projection of where they could land. Canadian portfolios often lean
          hard on the big banks and energy names, which tend to move together
          more than holding &ldquo;5 different stocks&rdquo; suggests. Beta
          and Alpha, below, measure each against the{" "}
          {marketData.benchmark.name}.
        </p>
      </div>

      <RiskDashboard
        riskMeta={riskData.meta}
        marketMeta={marketData.meta}
        stocksRaw={marketData.stocks}
        benchmark={marketData.benchmark}
      />
    </div>
  );
}
