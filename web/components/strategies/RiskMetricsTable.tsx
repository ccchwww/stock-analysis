import type { PerformanceRow, RiskAdjustedRow } from "@/lib/risk-adjusted";
import { metricExplainers } from "@/lib/risk-adjusted";
import { formatPct, toneOf, toneTextClass } from "@/lib/format";

// Risk-adjusted scoring for every line on the chart. Separate from
// ComparisonTable because the two answer different questions: that one asks
// "what did it return", this one asks "was the return worth the risk, and how
// much trading did it take".

function PassiveTag() {
  return (
    <span className="ml-1 rounded bg-zinc-700/50 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
      Passive
    </span>
  );
}

function Cell({
  value,
  className = "text-zinc-300",
}: {
  value: string;
  className?: string;
}) {
  return (
    <td className={`whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums ${className}`}>
      {value}
    </td>
  );
}

function formatTurnover(value: number | null): string {
  if (value === null) return "—";
  // Sub-1x turnover reads better with a decimal; a 380x daily strategy does not.
  return value >= 10 ? `${value.toFixed(0)}×` : `${value.toFixed(1)}×`;
}

export default function RiskMetricsTable({
  rows,
  metrics,
  colorById,
  riskFreeRateAnnual,
  tradingDays,
  startDate,
}: {
  rows: PerformanceRow[];
  metrics: RiskAdjustedRow[];
  colorById: Record<string, string>;
  riskFreeRateAnnual: number;
  tradingDays: number;
  startDate: string;
}) {
  const explainers = metricExplainers(riskFreeRateAnnual, tradingDays);
  const descriptionById = Object.fromEntries(rows.map((r) => [r.id, r.description]));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Risk-adjusted comparison</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Return per unit of risk, and the trading it took to get there — recomputed from{" "}
          {startDate} at the transaction cost currently assumed. A high return earned with
          high volatility and heavy turnover is a different proposition from the same return
          earned quietly.
        </p>
      </div>

      {/* The table scrolls inside this box, never the page: min-w forces the
          columns to keep their width and overflow-x-auto catches the rest, so
          a 375px phone gets a swipeable table rather than a squeezed one. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium">Line</th>
              <th className="px-4 py-3 text-right font-medium">CAGR</th>
              <th className="px-4 py-3 text-right font-medium">Volatility</th>
              <th className="px-4 py-3 text-right font-medium">Sharpe</th>
              <th className="px-4 py-3 text-right font-medium">Max Drawdown</th>
              <th className="px-4 py-3 text-right font-medium">Turnover / yr</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorById[m.id] ?? "#a1a1aa" }}
                    />
                    <div>
                      <div className="font-medium text-foreground">
                        {m.label}
                        {m.kind === "benchmark" && <PassiveTag />}
                      </div>
                      <div className="text-xs text-zinc-500">{descriptionById[m.id]}</div>
                    </div>
                  </div>
                </td>
                <Cell
                  value={m.cagr !== null ? formatPct(m.cagr) : "n/a"}
                  className={m.cagr !== null ? toneTextClass(toneOf(m.cagr)) : "text-zinc-500"}
                />
                <Cell value={m.volatility !== null ? formatPct(m.volatility) : "n/a"} />
                <Cell
                  value={m.sharpe !== null ? m.sharpe.toFixed(2) : "n/a"}
                  className={m.sharpe !== null ? toneTextClass(toneOf(m.sharpe)) : "text-zinc-500"}
                />
                <Cell
                  value={m.maxDrawdown !== null ? formatPct(m.maxDrawdown) : "n/a"}
                  className="text-red-400"
                />
                <Cell value={formatTurnover(m.annualizedTurnover)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed sm:grid-cols-2">
        {explainers.map((e) => (
          <div key={e.term}>
            <dt className="inline font-medium text-zinc-300">{e.term}: </dt>
            <dd className="inline text-zinc-500">{e.definition}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          Assumptions &amp; limitations
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-zinc-400">
          <li>
            Sharpe uses the same constant Canadian risk-free rate as the Risk Dashboard
            ({formatPct(riskFreeRateAnnual, 2)}, set manually in <code>backtest/config.py</code>,
            not a live feed) and the same {tradingDays}-trading-day annualization. It is a
            single number applied across the whole window, so it does not track the rate
            actually moving.
          </li>
          <li>
            Volatility and Sharpe annualize by √{tradingDays}, which assumes daily returns are
            independent. Real returns cluster in volatility, so both are smoothed relative to
            what a turbulent stretch actually felt like.
          </li>
          <li>
            Max drawdown is measured inside the selected window only — a deeper fall just
            before the start date is not counted. Shortening the window can only ever make it
            look shallower.
          </li>
          <li>
            Turnover counts the strategy&rsquo;s own trading. For passive benchmarks it is shown
            as &ldquo;—&rdquo; rather than zero: the fund trades internally to track its index,
            and that activity is not measured here.
          </li>
        </ul>
      </div>
    </div>
  );
}
