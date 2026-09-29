import type { ReactNode } from "react";
import type { MarketDataMeta, IndexBenchmark } from "@/lib/market-data-types";
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
  benchmarkName,
  benchmarkTicker,
  indexBenchmarks,
  resultsMeta,
  riskMeta,
  validationMeta,
  stressConfig,
  stressDataMeta,
  gfcLookbackCoverage,
}: {
  marketMeta: MarketDataMeta;
  /** CAPM benchmark identity, read from market_data.json rather than written
   *  here, so changing BENCHMARK_TICKER in backtest/config.py updates this
   *  page too. */
  benchmarkName: string;
  benchmarkTicker: string;
  indexBenchmarks: IndexBenchmark[];
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
          Benchmarks are <span className="text-zinc-200">CAD-listed ETFs, not index levels</span>. An index
          such as the S&amp;P/TSX Composite is a price index — it excludes dividends, while these stock
          returns include them, so regressing one against the other used to credit the index&rsquo;s entire
          dividend yield to alpha. The ETFs&rsquo; adjusted closes are total returns on the same basis.
          The trade-off is that an ETF return is{" "}
          <span className="text-zinc-200">net of that fund&rsquo;s management fee (MER)</span> and carries
          its own tracking error, so each benchmark sits slightly below the index it follows. Current
          benchmarks: {benchmarkName} (<code>{benchmarkTicker}</code>) for CAPM beta/alpha and stress
          testing
          {indexBenchmarks.length > 0 && (
            <>
              , plus{" "}
              {indexBenchmarks.map((b) => `${b.label} (${b.ticker})`).join(" and ")} as passive comparisons
              on the Strategies tab
            </>
          )}
          .
        </Item>
        <Item>
          The S&amp;P 500 benchmark is <span className="text-zinc-200">unhedged</span>, so its returns
          include the USD/CAD exchange-rate move as well as the US market&rsquo;s own performance. That is
          deliberate — it is what a Canadian investor holding that fund actually experienced — but it means
          part of any gap it shows against the Canadian lines is currency, not equity performance, and the
          two are not separated anywhere on the site.
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
          convention and {benchmarkName} only — no size, value, momentum, or sector factors.
          The benchmark is a total-return ETF rather than a price index, so its dividends are included on
          the same basis as the stocks it is regressed against; an index level would have leaked its whole
          dividend yield into alpha.
        </Item>
        <Item>
          The Low-Volatility strategy ranks on realized volatility over a fixed{" "}
          {resultsMeta.low_vol_lookback_days}-trading-day trailing window, requiring{" "}
          {formatPct(resultsMeta.low_vol_min_coverage_fraction, 0)} coverage of it to rank a name. That
          window length is a fixed choice in <code>backtest/config.py</code>, not tuned — and a backward
          -looking volatility estimate says nothing about a stock that is about to become volatile. A pure
          volatility screen also applies no sector constraint, so it concentrates in defensive sectors by
          construction.
        </Item>
        <Item>
          Cost sensitivity re-prices each strategy at other transaction-cost levels arithmetically rather
          than re-running the backtest: cost enters each day&rsquo;s return as turnover × bps, and no
          strategy&rsquo;s stock selection reads the cost assumption, so the holdings are identical at every
          level and the restatement is exact. That exactness is about the <em>model</em>, not reality — the
          {" "}{resultsMeta.cost_bps.toFixed(0)} bps default is a floor that excludes bid-ask spread, market
          impact, taxes and failed fills.
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
          The data refreshes once per weeknight after the TSX close via a scheduled GitHub Actions job
          (<code>.github/workflows/refresh-data.yml</code>), which regenerates the JSON, runs a set of
          safety checks against the previous version, and commits only if they pass. It is still not a live
          feed: the &ldquo;Data as of&rdquo; stamp in the footer is the last date the market data actually
          covers, and if a refresh fails the previously published data simply stays up — the footer shows a
          staleness warning once it falls more than four business days behind.
          <span className="block mt-1">
            The long-history stress dataset (<code>stress_data.json</code>) is deliberately excluded from
            that job: its four crisis windows have fixed dates and cannot change, so it is regenerated by
            hand only when the benchmark or universe changes.
          </span>
        </Item>
        <Item>
          Stress-test optimized portfolios assume free rebalancing into the estimated weights — unlike the
          {" "}{resultsMeta.strategy_order.length} trading strategies, which pay an explicit{" "}
          {resultsMeta.cost_bps.toFixed(0)} bps per-trade cost (see <code>backtest/costs.py</code>), no
          transaction cost is charged for entering the min-variance or max-Sharpe portfolios in a stress
          window.
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
