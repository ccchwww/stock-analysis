import { getMarketData } from "@/lib/market-data-results";
import { getResults } from "@/lib/results";
import { getRiskData } from "@/lib/risk-results";
import { getValidationData } from "@/lib/validation-results";
import { getStressData } from "@/lib/stress-data-results";
import AssumptionsLimitationsPanel from "@/components/assumptions/AssumptionsLimitationsPanel";

export const metadata = {
  title: "Assumptions & Limitations",
};

// How many of the stress dataset's tickers have ANY data at all in a given
// window's pre-window lookback period -- computed here, live, from
// stress_data.json's actual content, rather than a hand-typed number that
// could silently go stale the next time the data is regenerated.
function countTickersWithAnyData(
  dates: string[],
  stocks: Record<string, { returns: (number | null)[] }>,
  start: string,
  end: string,
): number {
  const startIdx = dates.findIndex((d) => d >= start);
  if (startIdx === -1) return 0;
  let endIdx = -1;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= end) {
      endIdx = i;
      break;
    }
  }
  if (endIdx < startIdx) return 0;

  let count = 0;
  for (const ticker of Object.keys(stocks)) {
    const slice = stocks[ticker].returns.slice(startIdx, endIdx + 1);
    if (slice.some((r) => r !== null)) count++;
  }
  return count;
}

export default async function AssumptionsPage() {
  const [marketData, resultsData, riskData, validationData, stressData] = await Promise.all([
    getMarketData(),
    getResults(),
    getRiskData(),
    getValidationData(),
    getStressData(),
  ]);

  const gfcWindow = validationData.stress.windows.find((w) => w.key === "gfc_2008");
  const gfcLookbackCoverage = gfcWindow
    ? countTickersWithAnyData(stressData.meta.dates, stressData.stocks, gfcWindow.lookback_start, gfcWindow.start)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Assumptions &amp; Limitations</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Every feature on this site states its own assumptions inline, next to the numbers they affect —
          this page does not replace those. It collects them into one place, grouped by category, for anyone
          deciding how much to trust a given number before digging into the feature that produced it. Numbers
          quoted below are read live from the same generated JSON the rest of the site uses, not hand-typed,
          so they can&rsquo;t silently drift out of sync with the data. For full methodology and the actual
          validation results (including tests the models failed), see{" "}
          <code className="rounded bg-surface px-1 py-0.5 text-xs">MODEL_DOCUMENTATION.md</code> in the
          repository root.
        </p>
      </div>

      <AssumptionsLimitationsPanel
        marketMeta={marketData.meta}
        benchmarkName={marketData.benchmark.name}
        benchmarkTicker={marketData.benchmark.ticker}
        indexBenchmarks={Object.values(marketData.index_benchmarks)}
        resultsMeta={resultsData.meta}
        riskMeta={riskData.meta}
        validationMeta={validationData.meta}
        stressConfig={validationData.stress}
        stressDataMeta={stressData.meta}
        gfcLookbackCoverage={gfcLookbackCoverage}
      />
    </div>
  );
}
