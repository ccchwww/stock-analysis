import type { DerivedStats } from "@/lib/derived-stats";
import { formatSignedPct, toneOf, toneTextClass } from "@/lib/format";
import { colorForTicker } from "@/lib/stock-colors";
import { tickerWithName } from "@/lib/ticker-label";

export default function StockStatsTable({
  tickers,
  stats,
  names,
}: {
  tickers: string[];
  stats: Record<string, DerivedStats>;
  names: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3 font-medium">Stock</th>
            <th className="px-4 py-3 font-medium text-right">Total Return</th>
            <th className="px-4 py-3 font-medium text-right">Final Value</th>
            <th className="px-4 py-3 font-medium text-right">Annualized (CAGR)</th>
          </tr>
        </thead>
        <tbody>
          {tickers.map((ticker) => {
            const s = stats[ticker];
            const noData = !s || s.numPeriods === 0;
            return (
              <tr key={ticker} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2" title={tickerWithName(ticker, names[ticker])}>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForTicker(ticker) }}
                    />
                    <div>
                      <div className="font-mono font-medium text-foreground">{ticker}</div>
                      {names[ticker] && (
                        <div className="text-xs text-zinc-500">{names[ticker]}</div>
                      )}
                    </div>
                  </div>
                </td>
                {noData ? (
                  <td colSpan={3} className="px-4 py-3 text-right text-xs text-zinc-500">
                    No data in this window
                  </td>
                ) : (
                  <>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums ${
                        s.totalReturn !== null ? toneTextClass(toneOf(s.totalReturn)) : "text-zinc-500"
                      }`}
                    >
                      {s.totalReturn !== null ? formatSignedPct(s.totalReturn, 1) : "n/a"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-300">
                      {s.finalValue !== null
                        ? `$${s.finalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : "n/a"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums ${
                        s.cagr !== null ? toneTextClass(toneOf(s.cagr)) : "text-zinc-500"
                      }`}
                    >
                      {s.cagr !== null ? formatSignedPct(s.cagr, 1) : "n/a"}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
