import type { StressWindowResult, WindowStats } from "@/lib/stress-test";
import { formatPct, formatSignedPct, toneOf, toneTextClass } from "@/lib/format";
import { tickerWithName } from "@/lib/ticker-label";

function StatRow({
  label,
  stats,
  sublabel,
}: {
  label: string;
  stats: WindowStats | null;
  sublabel?: string;
}) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-2">
        <div className="text-foreground">{label}</div>
        {sublabel && <div className="text-xs text-zinc-500">{sublabel}</div>}
      </td>
      {stats ? (
        <>
          <td className={`px-3 py-2 text-right font-mono tabular-nums ${toneTextClass(toneOf(stats.totalReturn))}`}>
            {formatSignedPct(stats.totalReturn, 1)}
          </td>
          <td className="px-3 py-2 text-right font-mono tabular-nums text-red-400">
            {formatSignedPct(stats.maxDrawdown, 1)}
          </td>
          <td className="px-3 py-2 text-right font-mono tabular-nums text-zinc-300">
            {formatPct(stats.annualizedVolatility, 1)}
          </td>
          <td className="px-3 py-2 text-right font-mono tabular-nums text-red-400">
            {formatSignedPct(stats.worstDay, 2)}
          </td>
        </>
      ) : (
        <td colSpan={4} className="px-3 py-2 text-right text-xs text-zinc-500">
          N/A — no data in this window
        </td>
      )}
    </tr>
  );
}

export default function StressWindowCard({
  result,
  names,
  benchmarkName,
}: {
  result: StressWindowResult;
  names: Record<string, string>;
  /** From stress_data.json's own benchmark entry (backtest/config.py). */
  benchmarkName: string;
}) {
  const { window, tickerCoverage, perStock, equalWeight, benchmark, minVariance, maxSharpe, correlation } = result;
  const uncovered = tickerCoverage.filter((c) => !c.covered);

  const minVarWeightsText = minVariance.weights
    ? Object.entries(minVariance.weights)
        .filter(([, w]) => w >= 0.005)
        .sort(([, a], [, b]) => b - a)
        .map(([t, w]) => `${t} ${formatPct(w, 0)}`)
        .join(", ")
    : null;
  const maxSharpeWeightsText = maxSharpe.weights
    ? Object.entries(maxSharpe.weights)
        .filter(([, w]) => w >= 0.005)
        .sort(([, a], [, b]) => b - a)
        .map(([t, w]) => `${t} ${formatPct(w, 0)}`)
        .join(", ")
    : null;

  const correlationDelta =
    correlation.baseline !== null && correlation.stress !== null ? correlation.stress - correlation.baseline : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{window.label}</h3>
        <span className="text-xs text-zinc-500">
          {window.start} → {window.end}
        </span>
      </div>

      {uncovered.length > 0 && (
        <p className="mt-1.5 text-xs text-amber-400">
          No usable data in this window for: {uncovered.map((c) => c.ticker).join(", ")} — excluded from the
          equal-weight blend and correlation below, shown as N/A individually.
        </p>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-medium">Entity</th>
              <th className="px-3 py-2 font-medium text-right">Total Return</th>
              <th className="px-3 py-2 font-medium text-right">Max Drawdown</th>
              <th className="px-3 py-2 font-medium text-right">Ann. Volatility</th>
              <th className="px-3 py-2 font-medium text-right">Worst Day</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(perStock).map((ticker) => (
              <StatRow key={ticker} label={tickerWithName(ticker, names[ticker])} stats={perStock[ticker]} />
            ))}
            <StatRow label="Equal-Weight" stats={equalWeight} sublabel="of selected, covered stocks" />
            <StatRow label="Benchmark" stats={benchmark} sublabel={benchmarkName} />
            <StatRow
              label="Min-Variance"
              stats={minVariance.insufficientData ? null : minVariance.stats}
              sublabel={
                minVariance.insufficientData
                  ? `N/A — insufficient pre-window data (${minVariance.qualifyingTickers.length} of ${Object.keys(perStock).length} selected stocks qualify)`
                  : `weights fixed from lookback: ${minVarWeightsText}`
              }
            />
            <StatRow
              label="Max-Sharpe"
              stats={maxSharpe.insufficientData ? null : maxSharpe.stats}
              sublabel={
                maxSharpe.insufficientData
                  ? `N/A — insufficient pre-window data (${maxSharpe.qualifyingTickers.length} of ${Object.keys(perStock).length} selected stocks qualify)`
                  : `weights fixed from lookback: ${maxSharpeWeightsText}`
              }
            />
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="font-medium text-zinc-300">Correlation:</span>
        <span>baseline {correlation.baseline !== null ? correlation.baseline.toFixed(2) : "n/a"}</span>
        <span>→</span>
        <span className={correlationDelta !== null && correlationDelta > 0 ? "text-red-400" : "text-zinc-300"}>
          stress-window {correlation.stress !== null ? correlation.stress.toFixed(2) : "n/a"}
        </span>
        {correlationDelta !== null && (
          <span className={correlationDelta > 0 ? "text-red-400" : "text-emerald-400"}>
            ({correlationDelta >= 0 ? "+" : ""}
            {correlationDelta.toFixed(2)})
          </span>
        )}
      </div>
    </div>
  );
}
