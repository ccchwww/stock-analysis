import StatCard from "@/components/shared/StatCard";
import { formatSignedPct, toneOf } from "@/lib/format";
import type { DerivedStats } from "@/lib/derived-stats";

export default function PortfolioSummary({
  summary,
  numStocks,
}: {
  summary: DerivedStats;
  numStocks: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Portfolio Total Return"
        value={summary.totalReturn !== null ? formatSignedPct(summary.totalReturn, 1) : "n/a"}
        tone={summary.totalReturn !== null ? toneOf(summary.totalReturn) : "neutral"}
        caption={`${numStocks} stocks, equal-weight`}
      />
      <StatCard
        label="Final Value"
        value={
          summary.finalValue !== null
            ? `$${summary.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : "n/a"
        }
        caption="of $10,000 invested"
      />
      <StatCard
        label="Annualized Return (CAGR)"
        value={summary.cagr !== null ? formatSignedPct(summary.cagr, 1) : "n/a"}
        tone={summary.cagr !== null ? toneOf(summary.cagr) : "neutral"}
        caption={summary.years !== null ? `geometric, over ${summary.years.toFixed(1)} years` : "geometric"}
      />
    </div>
  );
}
