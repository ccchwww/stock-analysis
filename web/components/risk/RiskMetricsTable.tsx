import type { RiskMeta } from "@/lib/risk-types";
import {
  annualizedVolatility,
  sharpeRatio,
  maxDrawdown,
  historicalVaR,
  historicalExpectedShortfall,
  computeBetaAlpha,
} from "@/lib/returns-math";
import { formatPct, formatSignedPct, toneOf, toneTextClass } from "@/lib/format";
import { colorForTicker } from "@/lib/stock-colors";
import { tickerWithName } from "@/lib/ticker-label";

export default function RiskMetricsTable({
  tickers,
  returnsByTicker,
  marketReturns,
  names,
  meta,
}: {
  tickers: string[];
  returnsByTicker: Record<string, (number | null)[]>;
  marketReturns: (number | null)[];
  names: Record<string, string>;
  meta: RiskMeta;
}) {
  const rows = tickers.map((ticker) => {
    const returns = returnsByTicker[ticker] ?? [];
    const betaAlpha = computeBetaAlpha(
      returns,
      marketReturns,
      meta.risk_free_rate_annual,
      meta.trading_days_per_year,
    );
    return {
      ticker,
      vol: annualizedVolatility(returns, meta.trading_days_per_year),
      sharpe: sharpeRatio(returns, meta.risk_free_rate_annual, meta.trading_days_per_year),
      maxDd: maxDrawdown(returns),
      varValue: historicalVaR(returns, meta.var_confidence),
      esValue: historicalExpectedShortfall(returns, meta.var_confidence),
      beta: betaAlpha?.beta ?? null,
      alpha: betaAlpha?.alpha ?? null,
    };
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3 font-medium">Stock</th>
            <th className="px-4 py-3 font-medium text-right">Ann. Volatility</th>
            <th className="px-4 py-3 font-medium text-right">Sharpe</th>
            <th className="px-4 py-3 font-medium text-right">Max Drawdown</th>
            <th className="px-4 py-3 font-medium text-right">
              VaR {formatPct(meta.var_confidence, 0)} (1d)
            </th>
            <th className="px-4 py-3 font-medium text-right">
              ES {formatPct(meta.var_confidence, 0)} (1d)
            </th>
            <th className="px-4 py-3 font-medium text-right">Beta</th>
            <th className="px-4 py-3 font-medium text-right">Alpha (Ann.)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const noData = row.vol === null && row.sharpe === null && row.maxDd === null;
            return (
              <tr key={row.ticker} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <div
                    className="flex items-center gap-2"
                    title={tickerWithName(row.ticker, names[row.ticker])}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForTicker(row.ticker) }}
                    />
                    <div>
                      <div className="font-mono font-medium text-foreground">{row.ticker}</div>
                      {names[row.ticker] && (
                        <div className="text-xs text-zinc-500">{names[row.ticker]}</div>
                      )}
                    </div>
                  </div>
                </td>
                {noData ? (
                  <td colSpan={7} className="px-4 py-3 text-right text-xs text-zinc-500">
                    No data in this window
                  </td>
                ) : (
                  <>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-300">
                      {row.vol !== null ? formatPct(row.vol, 1) : "n/a"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums ${
                        row.sharpe !== null ? toneTextClass(toneOf(row.sharpe)) : "text-zinc-500"
                      }`}
                    >
                      {row.sharpe !== null ? row.sharpe.toFixed(2) : "n/a"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-red-400">
                      {row.maxDd !== null ? formatSignedPct(row.maxDd, 1) : "n/a"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-red-400">
                      {row.varValue !== null ? formatPct(row.varValue, 2) : "n/a"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-red-400">
                      {row.esValue !== null ? formatPct(row.esValue, 2) : "n/a"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums text-zinc-300">
                      {row.beta !== null ? row.beta.toFixed(2) : "n/a"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums ${
                        row.alpha !== null ? toneTextClass(toneOf(row.alpha)) : "text-zinc-500"
                      }`}
                    >
                      {row.alpha !== null ? formatSignedPct(row.alpha, 1) : "n/a"}
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
