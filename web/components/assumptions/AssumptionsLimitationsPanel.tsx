import type { ReactNode } from "react";
import type { MarketDataMeta } from "@/lib/market-data-types";
import type { ResultsMeta } from "@/lib/types";
import type { RiskMeta } from "@/lib/risk-types";
import type { ValidationMeta, StressMeta } from "@/lib/validation-types";
import type { StressDataMeta } from "@/lib/stress-data-types";
import { formatPct } from "@/lib/format";

function Category({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2.5 text-sm text-zinc-400">{children}</ul>
    </div>
  );
}

function Item({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

export default function AssumptionsLimitationsPanel({
  marketMeta,
  resultsMeta,
  riskMeta,
  validationMeta,
  stressConfig,
  stressDataMeta,
  gfcLookbackCoverage,
}: {
  marketMeta: MarketDataMeta;
  resultsMeta: ResultsMeta;
  riskMeta: RiskMeta;
  validationMeta: ValidationMeta;
  stressConfig: StressMeta;
  stressDataMeta: StressDataMeta;
  gfcLookbackCoverage: number | null;
}) {
  const gfcWindow = stressConfig.windows.find((w) => w.key === "gfc_2008");

  return (
    <div className="flex flex-col gap-6">
      <Category title="Data Limitations">
        <Item>
          Prices come from Yahoo Finance via the unofficial <code>yfinance</code> Python package — not a
          licensed market-data feed, with no SLA. It can change format or drop coverage without notice; this
          project has no fallback source.
        </Item>
        <Item>
          {`${stressDataMeta.num_tickers} tickers are configured (the code calls this "S&P/TSX 60," but it's a curated large-cap subset, not literally all 60 constituents). Of those, ${marketMeta.num_tickers} survive`}{" "}
          the 5-year coverage filter used by the Strategies and Risk Dashboard tabs — one name is dropped for
          insufficient history over that window.
        </Item>
        <Item>
          Today&rsquo;s constituent list is applied retroactively across the whole {marketMeta.date_range.start}{" "}
          → {marketMeta.date_range.end} window (and the stress-test windows, further back) — names that left
          the index mid-window are excluded from the entire period, not just after they left. This
          survivorship bias is worse the further back a window goes:
          {gfcWindow && gfcLookbackCoverage !== null && (
            <>
              {" "}
              {`only ${gfcLookbackCoverage} of ${stressDataMeta.num_tickers} configured tickers have any data at all in the ${gfcWindow.lookback_start} → ${gfcWindow.start} lookback`}{" "}
              used for the 2008 crisis window&rsquo;s optimized-portfolio estimate.
            </>
          )}
        </Item>
        <Item>
          No independent TSX holiday calendar is cross-checked — trading days come from whatever yfinance
          returns for each <code>.TO</code> ticker and the benchmark, inner-joined against each other.
        </Item>
        <Item>
          A missing day is <code>null</code> everywhere in the generated JSON, never <code>0</code>, and every
          metric skips it rather than treating it as a flat day — except the strategies&rsquo; own equity
          curves, which flatten a gap to keep the displayed line continuous (a narrow, deliberate exception).
        </Item>
      </Category>

      <Category title="Model Limitations">
        <Item>
          Parametric VaR and the Monte Carlo projection both assume daily returns are i.i.d. Normal. Real
          equity returns have fatter tails and cluster in volatility — see the Model Validation tab for the
          current measured skewness/excess kurtosis and how often parametric VaR gets breached versus its
          nominal rate.
        </Item>
        <Item>
          Beta/Alpha use a single-factor CAPM against the {riskMeta.trading_days_per_year}-trading-day-a-year
          convention and the S&amp;P/TSX Composite only — no size, value, momentum, or sector factors.
        </Item>
        <Item>
          The Efficient Frontier optimizer treats historical mean returns and covariance as estimates of the
          future. Mean-variance optimization is notoriously sensitive to this, especially to the mean-return
          estimate — small changes can swing weights toward extreme, concentrated allocations. The Model
          Validation tab&rsquo;s stress tests show this concretely: the optimizer&rsquo;s max-Sharpe portfolio
          has underperformed a naive equal-weight blend of the same stocks in real historical crises.
        </Item>
        <Item>
          VaR backtesting uses a fixed {validationMeta.var_window_days}-trading-day rolling window for both
          historical and parametric VaR, at {validationMeta.confidence_levels.map((c) => formatPct(c, 0)).join(" and ")}{" "}
          confidence — not tuned per stock, and Basel traffic-light zones are only meaningful (and only
          applied) at the 99% level.
        </Item>
        <Item>
          Stress-test optimized portfolios are estimated from exactly {stressConfig.lookback_years} years of
          pre-window data, requiring at least{" "}
          {formatPct(stressConfig.min_coverage_fraction, 0)} coverage of that period to qualify a stock for
          the estimate — a fixed choice, not tuned per crisis window.
        </Item>
      </Category>

      <Category title="Implementation Limitations">
        <Item>
          There is no automated test suite. Correctness rests on ad hoc mutation tests and cross-checks
          against an independent Python/scipy reference run during development (documented in{" "}
          <code>MODEL_DOCUMENTATION.md</code> and the git history), not on tests that run automatically on
          every change.
        </Item>
        <Item>
          Nothing regenerates the data on a schedule — every JSON file here is produced by manually running
          the Python scripts in <code>backtest/</code>. The &ldquo;Data as of&rdquo; stamp in the footer
          reflects whenever that was last done, not a live feed.
        </Item>
        <Item>
          Stress-test optimized portfolios assume free rebalancing into the estimated weights — unlike the
          four trading strategies, which pay an explicit {resultsMeta.cost_bps.toFixed(0)} bps per-trade cost
          (see <code>backtest/costs.py</code>), no transaction cost is charged for entering the min-variance
          or max-Sharpe portfolios in a stress window.
        </Item>
        <Item>
          Every metric on this site is computed client-side, in the browser, from full daily-return JSON
          payloads — a deliberate choice so the start-date and stock-selection controls recompute instantly
          (there is no backend to hit), at the cost of shipping the full historical dataset to the browser
          rather than a lighter, precomputed summary.
        </Item>
      </Category>
    </div>
  );
}
