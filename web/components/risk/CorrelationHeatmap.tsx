import { colorForTicker } from "@/lib/stock-colors";
import { tickerWithName } from "@/lib/ticker-label";

function cellBackground(value: number | null, isDiagonal: boolean): string | undefined {
  if (isDiagonal || value === null) return undefined;
  const alpha = Math.min(1, Math.abs(value)) * 0.85;
  const rgb = value >= 0 ? "16, 185, 129" : "239, 68, 68"; // emerald-500 / red-500
  return `rgba(${rgb}, ${alpha.toFixed(2)})`;
}

export default function CorrelationHeatmap({
  tickers,
  matrix,
  names = {},
}: {
  tickers: string[];
  matrix: (number | null)[][] | null;
  names?: Record<string, string>;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">Correlation Matrix</h2>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">
        Pairwise correlation of daily returns among the selected stocks.
        Values near +1 (green) move together day to day — holding several
        highly-correlated names adds less diversification than it looks like;
        values near 0 or negative (red) move more independently of each
        other.
      </p>

      {!matrix || tickers.length < 2 ? (
        <div className="flex h-32 items-center justify-center text-sm text-zinc-500">
          Select 2+ stocks above to see their correlation matrix.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface p-1.5" />
                {tickers.map((ticker) => (
                  <th
                    key={ticker}
                    title={tickerWithName(ticker, names[ticker])}
                    className="whitespace-nowrap p-1.5 text-center font-mono font-medium text-zinc-400"
                  >
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ backgroundColor: colorForTicker(ticker) }}
                    />
                    {ticker}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickers.map((rowTicker, i) => (
                <tr key={rowTicker}>
                  <th
                    title={tickerWithName(rowTicker, names[rowTicker])}
                    className="sticky left-0 z-10 whitespace-nowrap bg-surface p-1.5 text-right font-mono font-medium text-zinc-400"
                  >
                    {rowTicker}
                  </th>
                  {tickers.map((colTicker, j) => {
                    const value = matrix[i][j];
                    const isDiagonal = rowTicker === colTicker;
                    return (
                      <td
                        key={colTicker}
                        className={`h-9 w-14 border border-border/40 text-center font-mono tabular-nums ${
                          isDiagonal ? "text-zinc-600" : "text-zinc-100"
                        }`}
                        style={{ backgroundColor: cellBackground(value, isDiagonal) }}
                      >
                        {value !== null ? value.toFixed(2) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
