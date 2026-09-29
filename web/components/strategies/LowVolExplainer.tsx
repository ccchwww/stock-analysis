import type { LowVolHoldings } from "@/lib/types";
import { formatPct } from "@/lib/format";

// The low-volatility anomaly, its mechanics here, and what specifically is
// wrong with it — stated on the page rather than assumed known, same as every
// other feature on this site.
export default function LowVolExplainer({
  lookbackDays,
  topN,
  minCoverageFraction,
  holdings,
}: {
  lookbackDays: number;
  topN: number;
  minCoverageFraction: number;
  holdings: LowVolHoldings;
}) {
  const top = holdings.holdings.slice(0, 6);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">
        Low Volatility — the anomaly, and what it costs
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Textbook finance says return is the reward for bearing risk, so the most volatile
        stocks should earn the most. Measured over decades, they have not. Portfolios of
        <span className="text-zinc-200"> low-volatility stocks have historically delivered
        better risk-adjusted returns than theory predicts</span> — sometimes better absolute
        returns too. That persistent gap between what the model says and what the data shows
        is the low-volatility anomaly. Common explanations are that leverage-constrained
        investors bid up high-beta names for their built-in leverage, and that lottery-like
        volatile stocks attract buyers on hope rather than expected value.
      </p>

      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        This implementation is the plain version: on the first trading day of each month,
        rank every stock by the standard deviation of its returns over the previous{" "}
        {lookbackDays} trading days, hold the {topN} lowest equal-weighted, and pay the same
        turnover-based cost as every other strategy. The ranking window ends on the
        <span className="text-zinc-200"> previous month&rsquo;s final close</span> — the
        rebalance day&rsquo;s own return is not in it, which the backtest asserts on every
        rebalance rather than leaving to a comment.
      </p>

      {top.length > 0 && (
        <div className="mt-4 rounded-md border border-border bg-background/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            What it actually held
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
            Most-selected names across all {holdings.rebalances}{" "}
            rebalances in the full test
            window (a description of the strategy&rsquo;s character, so it is not re-sliced by
            the start-date control):
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-zinc-400">
            {top.map((h) => (
              <li key={h.ticker}>
                <span className="text-zinc-200">{h.ticker}</span>{" "}
                {formatPct(h.fraction, 0)} of months
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
          Assumptions &amp; limitations
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-zinc-400">
          <li>
            <span className="text-zinc-200">Sector concentration is the main hidden risk.</span>{" "}
            A pure volatility screen is not diversified by design — it repeatedly lands on the
            same defensive corners of the market, typically regulated utilities, telecoms and
            large financials, as the holdings above show. A portfolio that looks calm on a
            volatility measure can still be a concentrated bet on one or two sectors and their
            shared exposure to interest rates. No sector constraint is applied here.
          </li>
          <li>
            <span className="text-zinc-200">Survivorship bias applies exactly as it does to
            the other strategies.</span>{" "}
            The universe is today&rsquo;s S&amp;P/TSX 60 applied
            backwards, so companies that left the index are absent. A firm that was quiet and
            compounding is precisely the sort that stays in an index, so the screen is reading
            an already-filtered pool.
          </li>
          <li>
            Trailing realized volatility is a backward-looking estimate. It persists reasonably
            well month to month, which is why a {lookbackDays}-day window works at all, but it
            says nothing about a name that is about to become volatile.
          </li>
          <li>
            A stock needs valid returns on at least {formatPct(minCoverageFraction, 0)} of the
            window to be ranked, so a name with a handful of quiet days cannot win a slot on
            missing data. The {lookbackDays}-day window and that threshold are fixed choices in{" "}
            <code>backtest/config.py</code>, not tuned or optimized.
          </li>
          <li>
            Volatility is measured on equal-weighted daily returns with no volatility targeting
            or risk-parity weighting — the ten names are held in equal dollar amounts, not
            equal risk contributions.
          </li>
        </ul>
      </div>
    </div>
  );
}
