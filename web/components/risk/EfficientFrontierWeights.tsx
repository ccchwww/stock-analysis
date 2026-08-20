import type { FrontierPoint } from "@/lib/efficient-frontier";
import { formatPct } from "@/lib/format";
import { colorForTicker } from "@/lib/stock-colors";
import { tickerWithName } from "@/lib/ticker-label";

const NEGLIGIBLE_WEIGHT = 0.005; // below 0.5%, shown muted -- corner portfolios routinely zero out most names

// Matches EfficientFrontierChart's marker colors, so the bar breakdown below
// reads as the same two portfolios shown on the chart above it.
const MIN_VAR_COLOR = "#a78bfa";
const MAX_SHARPE_COLOR = "#fbbf24";

function WeightBar({ weight, color }: { weight: number; color: string }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(1, weight)) * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function EfficientFrontierWeights({
  tickers,
  names,
  minVariance,
  maxSharpe,
}: {
  tickers: string[];
  names: Record<string, string>;
  minVariance: FrontierPoint;
  maxSharpe: FrontierPoint;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-zinc-500">
            <th className="px-4 py-3 font-medium">Stock</th>
            <th className="px-4 py-3 font-medium">Min-Variance Weight</th>
            <th className="px-4 py-3 font-medium">Max-Sharpe Weight</th>
          </tr>
        </thead>
        <tbody>
          {tickers.map((ticker, i) => {
            const minW = minVariance.weights[i] ?? 0;
            const sharpeW = maxSharpe.weights[i] ?? 0;
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
                      {names[ticker] && <div className="text-xs text-zinc-500">{names[ticker]}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <div
                    className={`font-mono tabular-nums ${minW < NEGLIGIBLE_WEIGHT ? "text-zinc-500" : "text-zinc-200"}`}
                  >
                    {formatPct(minW, 1)}
                  </div>
                  <WeightBar weight={minW} color={MIN_VAR_COLOR} />
                </td>
                <td className="px-4 py-3 align-middle">
                  <div
                    className={`font-mono tabular-nums ${sharpeW < NEGLIGIBLE_WEIGHT ? "text-zinc-500" : "text-zinc-200"}`}
                  >
                    {formatPct(sharpeW, 1)}
                  </div>
                  <WeightBar weight={sharpeW} color={MAX_SHARPE_COLOR} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
