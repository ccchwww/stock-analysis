import { getValidationData } from "@/lib/validation-results";
import { getMarketData } from "@/lib/market-data-results";
import { getStressData } from "@/lib/stress-data-results";
import { getRiskData } from "@/lib/risk-results";
import ModelValidationDashboard from "@/components/validation/ModelValidationDashboard";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Model Validation");

export default async function ValidationPage() {
  const [validationData, marketData, stressData, riskData] = await Promise.all([
    getValidationData(),
    getMarketData(),
    getStressData(),
    getRiskData(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Model Validation</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Tests whether the risk metrics shown elsewhere on this site are
          actually well-calibrated, rather than assuming a model that looks
          reasonable is reasonable. The first section backtests the 95%/99%
          VaR shown on the Risk Dashboard against what actually happened,
          out-of-sample, using standard likelihood-ratio tests. The second
          replays four real historical crises against the current stock
          selection — individually, blended, and via the Efficient
          Frontier&rsquo;s optimized portfolios.
        </p>
      </div>

      <ModelValidationDashboard
        validationMeta={validationData.meta}
        stressConfig={validationData.stress}
        marketMeta={marketData.meta}
        stocksRaw={marketData.stocks}
        stressDataMeta={stressData.meta}
        stressStocksRaw={stressData.stocks}
        stressBenchmark={stressData.benchmark}
        riskMeta={riskData.meta}
      />
    </div>
  );
}
