# Model Documentation

**Owner:** the sole author/maintainer of this repository. This is a personal
portfolio project with no separate model-risk function, no independent
validation team, and no committee sign-off — the structure below borrows
OSFI E-23's headings because they force honesty about scope and limitations,
not because this project meets that guideline's governance bar.

**Version:** reflects the state of the repository after "Model Validation
Part 3 — Documentation & Transparency Layer."

**Review date:** 2026-08-12 (the date this document was written and last
checked against the code and generated JSON it describes).

**Scope of this document:** every quantitative model in the `stock-analysis`
web app — the five trading strategies, the Risk Dashboard's metrics, the
Efficient Frontier optimizer, and the Model Validation tab's VaR backtest and
stress tests. It does not cover the Next.js/React implementation details
except where they affect what a number means.

---

## 1. Model purpose and intended use

This project is a **backtesting and risk-visualization sandbox** for a basket
of Canadian large-cap ("TSX 60-like") stocks. It exists to demonstrate, on
one's own historical data, how a handful of standard quant techniques behave
— including where they fail — with every assumption stated next to the
number it produces.

**What it is for:**
- Exploring how simple momentum/mean-reversion rules would have performed,
  net of an assumed trading cost, over the trailing ~5 years.
- Computing standard risk metrics (volatility, Sharpe, VaR, drawdown,
  Beta/Alpha) for any combination of the covered stocks, for a selected
  window.
- Illustrating classical mean-variance portfolio optimization and its
  well-known instability.
- Backtesting whether the VaR model shown is *actually* calibrated, and
  stress-testing the same stocks against four real historical crises.

**What it is explicitly NOT for:**
- **Not investment advice.** Nothing here is a recommendation to buy, sell,
  or hold any security. The "verdict" banners on the Strategies tab describe
  what already happened in a specific historical window, net of one cost
  assumption — they are not a forecast.
- **Not a production risk system.** There is no real-time data feed, no
  intraday risk, no position-level P&L, no reconciliation against an actual
  book, and no independent model validation function reviewing it.
- **Not suitable for live trading decisions**, automated or manual. The
  strategies backtested here have no execution logic, no slippage model
  beyond a flat basis-point assumption, and no capacity/liquidity
  constraints.
- **Not a point-in-time historical reconstruction.** The stock universe is
  today's constituent list applied retroactively (see §4) — a real
  institutional model of this kind would use point-in-time index membership.

---

## 2. Methodology, per model

### 2.1 Trading strategies (`backtest/strategies.py`)

Five strategies run over the same universe and window so they're directly
comparable:

| Strategy | Rule | Rebalance | Cost paid |
|---|---|---|---|
| 1-Day Momentum | Rank all stocks by day *N*'s return, buy the top 10, score on day *N+1*'s return | Daily | Every day, on actual turnover |
| 12-Month Momentum | Rank by trailing ~252-trading-day return as of the *previous* month's last close, buy the top 10 | Monthly | Once/month, on actual turnover |
| Mean Reversion | Same as 1-Day Momentum but buys the bottom 10 (yesterday's biggest losers) | Daily | Every day, on actual turnover |
| Low Volatility | Rank by standard deviation of returns over the trailing 60 trading days ending on the *previous* month's last close, buy the 10 lowest | Monthly | Once/month, on actual turnover |
| Buy & Hold (same-universe benchmark) | Equal-weight all covered tickers, held for the whole window | Once (initial buy-in) | Once, one-way |

**Low Volatility rationale.** The low-volatility anomaly is the persistent
empirical finding that low-volatility stocks have delivered better
*risk-adjusted* returns than CAPM predicts — the opposite of a clean
risk-return trade-off. The usual explanations are leverage-constrained
investors bidding up high-beta names for their embedded leverage, and
lottery-preference demand for volatile stocks. This is the plain
implementation: rank on realized volatility, hold the ten calmest
equal-weighted. `LOW_VOL_LOOKBACK_DAYS = 60` and
`LOW_VOL_MIN_COVERAGE_FRACTION = 0.9` are fixed choices in `config.py`, not
tuned; the coverage floor stops a name with a handful of observations winning
a slot on missing data rather than on genuinely low risk. Its distinctive
limitation is **sector concentration**: a pure volatility screen applies no
sector constraint and repeatedly lands on regulated utilities, telecoms and
large financials, so a portfolio that scores as calm can still be a
concentrated bet on a few sectors and their shared rate exposure. The
Strategies tab reports the actual most-selected names, computed from the real
rebalance history rather than asserted.

**Look-ahead-bias control:** a selection made "as of" a given date/close may
only use returns or prices known at or before that date; the return realized
on any later date is purely an outcome, never fed back into the selection.
Concretely: the two 1-day strategies rank on day *N*'s return and are scored
on day *N+1*'s; the two monthly strategies select using data as of the close
of the month *before* the one they trade, then hold that basket unchanged
(daily equal-weight return) through the whole month.

Both monthly strategies now share one engine (`_monthly_rank_and_hold`) so
the rebalance cadence, the cost model, and the look-ahead rule cannot drift
apart between them. The shared engine raises if a basket's selection date is
not strictly earlier than its first trading day; Low Volatility additionally
asserts that its window — sliced by position as
`returns.iloc[first_pos - lookback_days : first_pos]`, where Python's
half-open slicing makes the rebalance row exclusive — ends strictly before the
rebalance date. Both checks run on every rebalance of every run, not in tests
only. (Control check during development: shifting that window by one day to
*include* the rebalance date changes the selected basket on 25 of 57
rebalances, so the boundary is load-bearing rather than cosmetic.)

**Passive index benchmarks.** Alongside Buy & Hold, the Strategies tab plots
CAD-listed index ETFs (`INDEX_BENCHMARKS` in `config.py`): **XIU.TO**
(iShares S&P/TSX 60) and **ZSP.TO** (BMO S&P 500, CAD, unhedged). The two
benchmarks answer different questions and the page says so: Buy & Hold is an
equal-weight basket of *the same 51 names the strategies pick from*, so it
isolates whether the picking rules add anything; an index ETF is what a
passive investor would actually have owned instead. ETFs rather than raw
index levels, because index levels are price-only and exclude dividends while
these stock returns include them, and because `^GSPC` is quoted in USD —
an unhedged CAD-listed fund captures the currency move a Canadian investor
actually experienced. The cost of that choice, stated on the page: ETF
returns are net of each fund's MER and carry tracking error, and the S&P 500
line mixes currency with equity performance. No strategy transaction cost is
charged against a benchmark; they are held, not traded.

**Cost model** (`backtest/costs.py`): `turnover = (num_sold + num_bought) /
basket_size`; `cost = turnover * (cost_bps / 10,000)`. A full round-trip
replacement of one position (sell one, buy another) counts as one sell leg
+ one buy leg. Buy & Hold pays the cost once, on the initial buy-in only,
since there is never a subsequent sale in the window.

**Metric convention** (`backtest/engine.py`, mirrored client-side in
`web/lib/derived-stats.ts`/`equity-curve.ts` for the interactive start-date
control): total return is the compounded ratio of the equity curve's last
value to its first — computed this way *specifically* so strategies with
different rebalance cadences (daily vs. monthly) remain comparable on one
number. "Up-rate"/"average return" are measured per trading DAY for every
strategy including 12-Month Momentum (not per rebalance-month) — a
deliberate simplification stated in the code so all five strategies and every
individual stock share one recompute path for any user-chosen start date.

**Cost sensitivity and break-even cost** (`web/lib/cost-model.ts`). Each
strategy's total return is shown at 0, 10, 25, 50 and 100 bps one-way, plus
the break-even cost at which it ties Buy & Hold. This matters most for the
daily strategies, which turn the entire basket over nearly every session: at
that turnover the headline result is more a statement about the assumed cost
than about the signal.

The backtest exports, per strategy and per day, both the net return and the
**turnover** it was charged on. Cost enters a day's return only as
`turnover × bps / 10,000`, and no strategy's selection rule reads `cost_bps`
— they rank on returns, trailing returns, or volatility — so the holdings are
identical at every cost level and turnover is invariant to it. Net return is
therefore an *exact* linear function of the cost level, which is what lets
the frontend re-price any strategy at any bps from one stored series rather
than shipping a separate backtest per scenario. This is not assumed: on every
data refresh `_verify_cost_linearity` in `momentum_backtest.py` re-runs all
five strategies at a different cost level and fails the job if the
reconstruction disagrees (observed error ~1e-17, i.e. float noise).

Break-even is solved by **bisection** to 0.01 bps over 0–500 bps, re-pricing
*both* sides at each candidate — Buy & Hold pays its own buy-in cost, and
holding it fixed while varying the strategy's would quietly flatter the
strategy. There is no closed form (cost compounds multiplicatively across
hundreds of days), but the difference is monotone decreasing in cost whenever
the strategy trades more than Buy & Hold, which every active strategy does.
The reported result is honest in both directions: a strategy behind Buy &
Hold at zero cost is labelled "underperforms Buy & Hold even with zero
costs", and one still ahead at the top of the range is labelled as such
rather than given a fabricated crossing point.

### 2.2 Risk Dashboard metrics (`web/lib/returns-math.ts`)

All computed **client-side**, driven by `market_data.json`'s daily-return
series, so every metric recomputes instantly for any stock selection or
start date (there is no backend to hit — see §4 for why this matters for
correctness, not just performance).

- **Annualized volatility:** sample standard deviation of daily returns
  (Bessel-corrected, `n-1`), scaled by `sqrt(252)`.
- **Sharpe ratio:** `(annualized mean return − risk-free rate) / annualized
  volatility`. Mean and volatility are each annualized independently, then
  the (already-annual) risk-free rate is subtracted — the standard textbook
  form, not a precise treatment of compounding.
- **Max drawdown:** worst peak-to-trough decline in the compounded
  growth-of-$1 curve over the selected window.
- **Historical VaR:** empirical percentile — sort daily returns ascending,
  read off the `floor((1−confidence) × n)`-th value, negate it. No
  distributional assumption.
- **Expected Shortfall (CVaR):** mean of the tail at or beyond the same VaR
  cutoff — the average loss on the worst days, not just where they begin.
- **Beta/Alpha (CAPM):** `beta = cov(stock, market) / var(market)`; `alpha =
  actual annualized return − [risk-free + beta × (market return −
  risk-free)]`, both regressed against **XIU.TO** (iShares S&P/TSX 60 Index
  ETF), set as `BENCHMARK_TICKER` in `config.py`. A total-return ETF, not an
  index level, so the benchmark includes dividends on the same basis as the
  stocks regressed against it — see §6 for the correction that changed this
  and what it did to reported alpha. **Single-factor** — see §6 for the
  multi-factor caveat.
- **Correlation matrix:** pairwise Pearson correlation, pairwise-complete
  (each cell uses whichever days both of that pair have data, independent of
  what a third stock is missing).
- **Rolling metrics** (`web/lib/rolling-metrics.ts`): volatility, Sharpe, and
  beta recomputed over a trailing 90-trading-day window that steps forward
  one day at a time (window *includes* the current day) — shows that risk
  is not constant, at the cost of the first 89 days of any selected window
  having no value yet (shown as a gap, never plotted as zero).
- **Monte Carlo projection** (`web/lib/monte-carlo.ts`): simulates daily
  returns as i.i.d. draws from a Normal distribution parameterized by the
  selection's own historical mean/volatility (a full covariance matrix for a
  multi-stock blend, via the portfolio-variance identity `wᵗΣw`). The
  right-skew in the output falls out of compounding many `(1+r)` factors —
  it is not imposed directly. Assumes i.i.d. Gaussian daily returns, which
  §5/§6 show this project's own data does not actually exhibit (fat tails,
  negative skew).

### 2.3 Efficient Frontier (`web/lib/efficient-frontier.ts`)

Classical long-only Markowitz mean-variance optimization, computed
client-side via **projected gradient descent/ascent on the probability
simplex** — not scipy, and not the textbook closed-form solution
(`w ∝ Σ⁻¹𝟙`), which is numerically unsafe for a near-singular covariance
matrix (e.g. two highly correlated stocks). Both the minimum-variance
objective and the risk-aversion-parametrized utility used to trace the
frontier are convex/concave quadratics over a convex constraint set, so
projected gradient methods are guaranteed to reach the global optimum for a
given input — this was verified against known closed-form answers on
synthetic cases before being wired into the UI (see git history for the
mutation/closed-form tests).

- **Constraints:** long-only (`w ≥ 0`), fully invested (`Σw = 1`). No
  shorting, no leverage, no position limits beyond that.
- **Minimum-variance portfolio:** direct minimization of `wᵗΣw`.
- **Maximum-Sharpe (tangency) portfolio:** found by sweeping a risk-aversion
  parameter λ over several orders of magnitude (calibrated relative to the
  *mean-return spread ÷ variance scale* of the actual input — an earlier,
  buggy version calibrated λ to variance alone and silently collapsed the
  whole frontier to one point for realistic data; caught and fixed via a
  synthetic-case regression test) and taking the point that maximizes
  `(return − risk-free) / volatility`, refined by golden-section search.
- **Random cloud:** for visual context only — uniform samples on the
  long-only simplex (Dirichlet(1,...,1)), never used for the reported
  min-variance/max-Sharpe points.
- **Inputs:** historical daily mean and covariance over whatever window is
  currently selected. **This is the single most caveated feature in the
  whole app** — see the on-page callout and §6.

### 2.4 VaR Backtesting (`web/lib/var-backtest.ts`)

Tests whether the historical (and parametric) VaR shown on the Risk
Dashboard is actually well-calibrated, using a **strictly out-of-sample
rolling 250-trading-day window**: VaR for day *t* uses only
`returns[t-250 .. t-1]`, never day *t* itself. This was proved, not just
asserted, by a mutation test before shipping: mutating day *t* or later
leaves `VaR[t]` unchanged; mutating `t-1` or `t-250` (the oldest in-window
day) always changes it; mutating `t-251` (just outside) never does.

- **Historical VaR (rolling):** the exact same empirical tail-cutoff formula
  as §2.2, applied to each trailing window instead of the whole selected
  period.
- **Parametric (normal) VaR (rolling):** `VaR = −(μ + z·σ)`, with `μ`/`σ`
  from the same trailing window, `z = −1.645` (95%) or `−2.326` (99%).
- **Exception:** `actual_return_t < −VaR_t`.
- **Kupiec proportion-of-failures test:** likelihood-ratio test of whether
  the observed exception rate matches the nominal rate (5% or 1%),
  chi-square(1), critical value 3.841 at 5% significance.
- **Christoffersen independence test:** likelihood-ratio test of whether
  exceptions cluster in time (via the 0/1 transition matrix of the exception
  indicator), chi-square(1), critical value 3.841.
- **Conditional coverage:** `LR_cc = LR_uc + LR_ind`, chi-square(2), critical
  value 5.991.
- **p-values:** chi-square(1)'s survival function is `erfc(sqrt(x/2))`
  (computed via a standard rational approximation of `erfc`, not scipy);
  chi-square(2)'s is the *exact* closed form `exp(−x/2)`. Both are
  cross-verified against Python's `scipy.stats.chi2.sf` in
  `backtest/validation.py`'s console report — see §5, the two implementations
  agree to displayed precision.
- **Basel traffic light:** applied **only** to the 99% historical series,
  scaled to a 250-observation-equivalent count (green ≤4, yellow 5–9, red
  ≥10). Deliberately **not** applied to the 95% series, where ~12.5
  exceptions per 250 days is the *expected* outcome for a correct model —
  applying Basel zones there would flag a correctly-calibrated model as red.
- **Warm-up:** the start-date control's minimum selectable date is fixed to
  `dates[250]`, so a user can never pick a date without a full 250-day
  warmup — the backtest never silently shortens its sample.

### 2.5 Historical Stress Testing (`web/lib/stress-test.ts`)

Replays four fixed historical windows against whichever stocks are
currently selected — independent of the start-date control, which only
affects §2.4.

| Window | Dates | 3-year lookback used for weights |
|---|---|---|
| 2008 Financial Crisis | 2008-06-18 → 2009-03-09 | 2005-06-18 → 2008-06-18 |
| Oil Price Crash | 2014-06-20 → 2016-01-20 | 2011-06-20 → 2014-06-20 |
| COVID-19 Crash | 2020-02-19 → 2020-03-23 | 2017-02-19 → 2020-02-19 |
| 2022 Rate-Hike Selloff | 2022-01-04 → 2022-10-14 | 2019-01-04 → 2022-01-04 |

For each window, computes total return / max drawdown / annualized
volatility / worst single day for: each selected stock, the equal-weight
blend, the benchmark (`BENCHMARK_TICKER`, now XIU.TO), and the
minimum-variance and maximum-Sharpe portfolios from §2.3.

**Look-ahead rule (the critical one for this feature):** the min-variance
and max-Sharpe weights are estimated using *only* the 3 years of data
immediately **before** each window opens, then held fixed (no rebalancing)
through the window itself. This was also caught by a mutation test during
development — an earlier version's lookback slice used an inclusive-end date
comparison that silently absorbed the window's own first day into the
"out-of-sample" estimate; fixed with a dedicated exclusive-end slice before
this shipped. If fewer than 2 selected stocks have sufficient (≥90%)
coverage in the lookback period, the optimized portfolios are reported as
`N/A — insufficient pre-window data` rather than falling back to an
in-sample, look-ahead-contaminated estimate.

**Correlation breakdown:** average pairwise Pearson correlation among
selected stocks during each window, compared against a baseline computed
over the **full downloaded sample (2005–2022) excluding all 4 stress
windows** (a specific labeled choice, not a cherry-picked calm sub-period).

---

## 3. Assumptions, per model

**Strategies (§2.1):**
- 10 bps one-way transaction cost per trade (`COST_BPS`), a "reasonable
  retail-ish baseline for large, liquid names" — real slippage, wider for
  less liquid names, is not separately modeled.
- Today's ~52-name universe applied across the whole 5-year window (see §4).
- No capital constraints, no position sizing beyond equal-weight, no
  capacity/liquidity limits.
- The monthly strategies' up-rate is measured daily, not per
  rebalance-month — an explicit, disclosed simplification, not an oversight.
- Low Volatility ranks on a fixed 60-trading-day trailing window
  (`LOW_VOL_LOOKBACK_DAYS`), requiring 90% coverage of it
  (`LOW_VOL_MIN_COVERAGE_FRACTION`) to rank a name. Neither is tuned. Trailing
  realized volatility is assumed to persist month-to-month; no sector or
  concentration constraint is applied.
- Index benchmarks are **CAD-listed ETFs**, so their returns are net of each
  fund's management fee (MER) and include tracking error — each sits slightly
  below the index it follows. The S&P 500 benchmark is **unhedged**, so part
  of any gap it shows is the USD/CAD move rather than US equity performance;
  the two are not separated anywhere on the site.
- Cost sensitivity re-prices arithmetically rather than re-running the
  backtest. Exact within the model (see §2.1), but the model's cost is a
  floor: bid-ask spread, market impact, taxes and failed fills are all
  outside it.

**Risk metrics / VaR / Monte Carlo (§2.2):**
- Risk-free rate is a hand-set constant, 2.75% annualized
  (`RISK_FREE_RATE_ANNUAL`), an illustrative approximation of Government of
  Canada 3-month T-bill yields — **not a live feed.**
- 252 trading days/year for all annualization.
- Historical VaR/ES assume the recent past is representative of the
  near-term future (no explicit assumption at all, which is itself a
  limitation — see §6).
- Parametric VaR and Monte Carlo assume i.i.d. Normally-distributed daily
  returns — contradicted by this project's own measured skewness (−0.19) and
  excess kurtosis (3.86) on the sample used in §5.
- Beta/Alpha assume a linear, stable relationship to the market and a single
  risk factor.

**Efficient Frontier (§2.3):**
- Historical mean returns and covariance are used as point estimates of the
  *future* — the single most fragile assumption in this project. Mean
  returns especially are notoriously hard to estimate precisely; small
  changes can swing "optimal" weights into extreme, concentrated
  allocations that happened to look good in one historical window with no
  reason to keep doing so.
- Long-only, fully-invested, no transaction costs on rebalancing into the
  optimized weights.

**VaR Backtesting (§2.4):**
- 250-trading-day rolling window (~1 trading year) for both historical and
  parametric VaR — a fixed choice, not tuned per stock.
- Missing-data days are skipped entirely from both the VaR estimate and the
  exception count, never treated as a 0% return or as an automatic
  exception.
- 5% significance level for all three tests (chi-square critical values
  3.841 / 3.841 / 5.991).

**Stress Testing (§2.5):**
- Exactly 3 calendar years of pre-window data for weight estimation,
  regardless of window length.
- 90% coverage threshold for "does this stock have usable data" in a given
  window or lookback period — below that, excluded (not zero-filled, not
  silently ignored — reported).
- Correlation baseline is one pooled figure over the full non-crisis sample,
  not a single specific "calm year."

---

## 4. Data sources, quality, and limitations

- **Source:** Yahoo Finance via the `yfinance` Python package —
  **an unofficial, reverse-engineered API with no SLA**, not a licensed
  market-data feed. It can silently change format, rate-limit, or drop
  coverage for a given ticker without notice; this project has no fallback
  data source and no automated monitoring for that.
- **Universe:** `backtest/config.py`'s `TICKERS` list has **52 entries**,
  described in its own comments as "S&P/TSX 60 constituents" — this is a
  curated large-cap subset, **not the literal, complete 60-name index**
  (roughly 8 real constituents are simply not in the list). Of those 52, one
  (`BAM.TO`) is dropped from the 5-year dataset for insufficient history
  (yfinance returns no usable data for it over that window — it appears to
  trace to Brookfield's 2022 corporate reorganization), leaving **51 usable
  tickers** for the Strategies and Risk Dashboard tabs. The stress-test
  dataset (§2.5) keeps all 52 (including `BAM.TO`, at 0% coverage) and
  reports per-window coverage explicitly instead of dropping.
- **Survivorship bias — two layers, the second much worse than the first:**
  1. *Everywhere:* today's constituent list is applied retroactively across
     the whole window. Names that left the index (acquired, delisted,
     demoted) during that window are excluded from the *entire* period
     rather than just the part after they left, biasing every backtest
     toward names that happened to survive to today.
  2. *Stress testing specifically, materially worse:* several of today's 52
     names did not exist as public companies, or under this ticker, during
     the earlier windows. Measured coverage of the *2008 lookback period*
     (2005-06-18 to 2008-06-18) across all 52: only **44 of 52** have any
     data at all; several — `SHOP.TO` (0%), `DOL.TO` (0%), `NTR.TO` (27%),
     `QSR.TO` (44%), `WSP.TO` (49%) — are far too incomplete to use, and this
     is *before* applying the 90% usability threshold. This is disclosed
     on-page, not silently absorbed into a smaller-but-unlabeled sample.
- **Adjusted prices:** `auto_adjust=True` in every yfinance call, so splits
  and dividends are reflected in the price series (a raw price jump from a
  split doesn't fake a large daily "loss"; a dividend doesn't fake a
  "loss" on the ex-date). No separate dividend-yield or total-return
  reporting is broken out — total return already includes reinvested
  dividends implicitly via the adjustment, but the split between price
  return and income return is not shown anywhere.
- **Trading calendar:** no explicit TSX holiday calendar is cross-checked or
  hand-maintained. The daily-return series for every `.TO` ticker and the
  benchmark (`XIU.TO`) both come from yfinance's own exchange-specific
  trading calendar, and `market_data.py` inner-joins stock dates against the
  benchmark's, dropping any date not present in both. In practice this means
  "whatever days yfinance says the TSX was open" — there is no independent
  verification against an official TSX holiday list.
- **Missing-data convention (applies everywhere):** a missing day is `null`
  in every JSON payload, never `0`. Every downstream calculation
  (volatility, correlation, VaR, drawdown, stress-window stats) explicitly
  skips `null` rather than treating it as a flat day, *except* the
  strategies' own equity curves (`buildEquityCurveFromReturns`), which treat
  a gap inside an already-active window as a flat 0% day specifically so the
  displayed curve stays visually continuous — a deliberate, narrow exception
  to the general rule, not an inconsistency.
- **No point-in-time fundamentals or corporate actions beyond
  splits/dividends** — no delisting-date handling beyond "yfinance returns
  no data," no ticker-symbol-change tracking (a renamed company under an old
  symbol would simply show as two unrelated series if it happened inside the
  window).

---

## 5. Validation results (actual numbers, including failures)

> **These figures are a snapshot.** Since the nightly refresh landed
> (`.github/workflows/refresh-data.yml`), the underlying data moves on a
> rolling 5-year window every weeknight, so the exact numbers quoted in this
> section and in §6 drift with it. They are recorded here as the values
> observed when each finding was written; the site itself always recomputes
> from current data. Where a *conclusion* depends on a number, the site
> derives the conclusion too rather than restating one from this document.

Reproduced from `python backtest/validation.py`'s console output against
the full 51-ticker equal-weight portfolio, full available history
(2021-08-12 to 2026-08-12, 1255 trading days, 1005 evaluable after the
250-day warmup). Re-run the command yourself to reproduce these exactly —
the numbers will drift slightly as the trailing 5-year window rolls forward
with time.

### 5.1 VaR backtest — Kupiec (coverage)

| Method | Confidence | N | Exceptions | Expected | Rate | Kupiec stat | p | Verdict |
|---|---|---|---|---|---|---|---|---|
| Historical | 95% | 1005 | 48 | 50.3 | 4.78% | 0.11 | 0.7429 | **pass** |
| Historical | 99% | 1005 | 8 | 10.1 | 0.80% | 0.45 | 0.5004 | **pass** |
| Parametric | 95% | 1005 | 45 | 50.3 | 4.48% | 0.60 | 0.4395 | **pass** |
| Parametric | 99% | 1005 | 13 | 10.1 | 1.29% | 0.80 | 0.3709 | **pass** |

Coverage (the overall exception rate) looks fine everywhere by this test —
but see §5.2 and §5.3 for two real problems Kupiec alone doesn't catch.

### 5.2 VaR backtest — Christoffersen (independence): **FAILED in all four cases**

| Method | Confidence | Stat | p | Verdict |
|---|---|---|---|---|
| Historical | 95% | 4.76 | 0.0292 | **REJECT** |
| Historical | 99% | 3.86 | 0.0493 | **REJECT** |
| Parametric | 95% | 5.90 | 0.0152 | **REJECT** |
| Parametric | 99% | 6.79 | 0.0092 | **REJECT** |

This is the most important finding in this document. **Every single VaR
series tested — both methods, both confidence levels — fails the
independence test at 5% significance.** The overall exception *rate* is
fine (§5.1), but exceptions are not scattered randomly through time; they
cluster. In practice this means breaches bunch up during volatile stretches
(the 2022 rate-hike period is the obvious candidate in this window) rather
than occurring independently day to day, which is exactly the failure mode
a rolling-window VaR model with a constant-variance assumption is prone to:
it reacts to a volatility regime change with a lag, so several exceptions in
a row happen before the trailing window "catches up." **Conditional
coverage** (which combines both tests) still passes for historical VaR
(p = 0.088 / 0.115) because Kupiec's strong pass offsets Christoffersen's
fail in the combined statistic, but **fails outright for parametric VaR at
both confidence levels** (p = 0.039 / 0.023) — the combined weight of a
borderline-elevated rate *and* clustering pushes it over the line.

### 5.3 VaR backtest — the fat-tail finding

Skewness of the tested return series: **−0.19** (mildly left-skewed — a
longer loss tail, typical for equities). Excess kurtosis: **3.86** (a
normal distribution has 0 — this sample's tails are far fatter than
Gaussian). Consistent with that, **parametric VaR at 99% is breached more
often than its own nominal 1% level** (1.29% observed) **and more often than
historical VaR at the same confidence** (0.80%) — exactly the expected
signature of assuming Normal returns when the real distribution has fatter
tails. Kupiec's test does not flag this specific comparison as significant
at *this* sample size (n=1005) even though the parametric rate is
proportionally ~29% too high — worth noting as a real limitation of Kupiec's
statistical power over a ~4-year sample, not evidence the model is fine.

### 5.4 Basel traffic light

Evaluated on **actual 250-observation windows**, raw counts, never a
rescaled long-run average (see the correction note below). 99% historical
VaR, full-universe equal-weight portfolio:

| Window | Dates | Exceptions | Zone |
|---|---|---|---|
| Trailing 250 observations | 2025-08-14 → 2026-08-12 | 0 | **GREEN** |
| Worst rolling 250-obs window | 2024-04-15 → 2025-04-10 | 4 | **GREEN** |

Both land in green here, consistent with §5.1's Kupiec pass at 99%. The two
figures are reported separately because they can and do diverge for other
selections — the default sector-diverse selection shown in the UI, for
instance, produces a green trailing window alongside a **yellow** worst
window. That divergence *is* the §5.2 clustering finding made visible, and
the page now states it explicitly when the zones differ.

**Correction (2026-09-20).** An earlier version of this section, and of the
on-page traffic light, scaled the total exception count over the whole
backtest down to a 250-day equivalent (e.g. 10 exceptions in 1005 days →
2.5 → GREEN). That was **wrong**: the Basel traffic-light test evaluates the
exception count in the most recent 250 observations, not a long-run average.
Averaging over ~1005 days deliberately smooths away clustering — precisely
the property §5.2's Christoffersen test *rejects* on this same data — so the
old display could show GREEN while a real 250-day window sat in YELLOW or
RED. Both the TypeScript implementation and the Python reference check now
use actual 250-observation windows, and additionally report the worst such
window anywhere in the backtest.

### 5.5 Stress test — the Big 5 Banks preset (RY/TD/BNS/BMO/CM)

> **Note (2026-09-20):** this selection is no longer the site default. It
> remains available as the one-click **"Big 5 Banks (concentration demo)"**
> preset, and the numbers below still describe it. See §5.6 for the new
> sector-diverse default.

Baseline pairwise correlation (full sample excluding all 4 crisis windows):
**0.739.**

| Window | Baseline → Stress correlation | Max-Sharpe return | Equal-weight return | Max-Sharpe vs equal-weight |
|---|---|---|---|---|
| 2008 GFC | 0.739 → 0.841 (+0.103) | −44.4% | −42.1% | **underperformed** |
| Oil Crash | 0.739 → 0.795 (+0.056) | −4.4% | −8.6% | outperformed |
| COVID Crash | 0.739 → 0.937 (+0.198) | −33.5% | −37.5% | outperformed |
| 2022 Rate Hikes | 0.739 → 0.773 (+0.034) | −11.1% | −13.5% | outperformed |

**Correlation rose in all four crises** relative to baseline — most sharply
in COVID (+0.198), confirming the expected "diversification benefits shrink
exactly when they're most needed" finding. **The max-Sharpe (tangency)
portfolio underperformed the naive equal-weight portfolio in 1 of these 4
crises** (2008 GFC) for this specific stock selection — direct empirical
evidence for the instability caveat in §2.3/§6, not a hypothetical concern.
This is selection-dependent: a mixed selection including recent IPOs
(`SHOP.TO`, `DOL.TO`) tested during development showed max-Sharpe
underperforming in 2 of 4 crises, including a −45.7% vs. −25.9% gap in the
2022 window — driven by the optimizer concentrating ~48% of weight into
`SHOP.TO` based on its pre-window (2019–2022) history, shortly before it
fell 79% over the window itself.

### 5.6 Stress test — the sector-diverse default (RY/ENB/CNR/BCE/ABX)

The site default as of 2026-09-20: `RY.TO` (financials), `ENB.TO` (energy),
`CNR.TO` (rail/industrials), `BCE.TO` (telecom), `ABX.TO` (materials). The
previous all-banks default averaged **0.739** baseline pairwise correlation,
which left the efficient frontier, correlation heatmap, and diversification
sections looking degenerate on first load — there was essentially nothing to
diversify. This selection averages **0.222**.

All five have yfinance history back to 1995–1996 (`RY`/`ENB`/`ABX`
1995-01-12, `BCE` 1996-05-06, `CNR` 1996-11-22) and **100% coverage of every
stress window and every pre-window lookback**, including the 2008 window's
3-year lookback from 2005-06-18 — the binding constraint that rules out
recently-listed TSX 60 names such as `SHOP.TO`.

| Window | Baseline → Stress correlation | Equal-weight return | Benchmark return |
|---|---|---|---|
| 2008 GFC | 0.222 → 0.312 (+0.090) | −17.6% | −49.8% |
| Oil Crash | 0.222 → 0.254 (+0.032) | −5.9% | −21.6% |
| COVID Crash | 0.222 → 0.590 (+0.368) | −24.6% | −37.1% |
| 2022 Rate Hikes | 0.222 → 0.297 (+0.075) | −4.6% | −13.6% |

**Correlation rose in all four crises here too** — and proportionally much
harder than for the banks (COVID: +0.368, versus +0.198 for the already-high
bank baseline). The "diversification shrinks when you need it" finding is
therefore *more* visible with a genuinely diversified selection, not less:
a portfolio averaging 0.22 correlation in calm periods behaved like a 0.59
one during the COVID crash. Max-Sharpe and min-variance figures for this
selection are computed client-side (see §2.5) and are not reproduced here,
since the Python reference check does not re-implement the optimizer.

---

## 6. Known deficiencies and planned remediation

| Deficiency | Why it matters | Planned remediation |
|---|---|---|
| Constant-volatility assumption in parametric VaR and Monte Carlo | §5.3 shows real returns have excess kurtosis of 3.86 — volatility clusters and spikes, it isn't constant | A GARCH(1,1)-style model, letting the variance forecast itself evolve, would likely close most of the parametric-vs-historical VaR gap in §5.3 |
| Single-factor CAPM (Beta/Alpha) | Attributes all systematic risk to one market factor; ignores size, value, momentum, sector effects that are well-documented in the literature | A multi-factor model (Fama-French-style, adapted to Canadian factor data) would decompose alpha more credibly |
| Christoffersen failure in every VaR series (§5.2) | The current rolling-window approach doesn't adapt fast enough to volatility regime changes, causing exception clustering | Same GARCH remediation above; alternatively, a shorter rolling window trades this off against noisier day-to-day estimates (an explicit tradeoff, not a free fix) |
| Point-in-time index membership | Survivorship bias throughout (§4) | Would require a licensed, point-in-time constituents dataset — yfinance has no such feature; out of scope for a project built entirely on free data |
| **Survivorship bias inflates the 12-Month Momentum result specifically** | This is where the bias does the most damage, and it is *not* symmetric across strategies. 12-Month Momentum returns **+192.0%** vs Buy & Hold's **+145.0%** — a **+47.0 pt** headline gap. But the universe is *today's* S&P/TSX 60 constituents applied backwards over 2021–2026, so names dropped from the index are absent entirely. A strategy that ranks and buys past winners is therefore selecting from a pool already filtered for survival, which inflates momentum **more than it inflates Buy & Hold**. Buy & Hold holds the same filtered universe and is biased too, but it does not additionally *select* within it — so the +47.0 pt **gap** is overstated by more than either figure alone, and should not be read as a reliable estimate of edge. The same caveat applies in kind to the other rank-and-select strategies (1-Day Momentum, Mean Reversion), though both lost to the benchmark here so the bias flatters a result that is negative anyway. | **Honestly: this cannot be quantified with the data this project has.** Correcting it requires point-in-time index constituent data — the historical membership of the S&P/TSX 60 at each rebalance date — so that names are in the universe only for the dates they actually belonged to it. yfinance does not provide this, and no free source does; it is a licensed dataset. Until then the magnitude of the overstatement is **unknown, not merely unmeasured**, and the result is reported with the caveat attached directly to the headline (Strategies tab) rather than only in a general limitations footer. |
| No transaction-cost model on Efficient-Frontier rebalancing | The optimized portfolios in stress testing assume free rebalancing into the estimated weights | Apply the same `COST_BPS` turnover model already used for the five trading strategies |
| Mean-variance input sensitivity (§2.3) | Small changes to estimated mean returns can produce extreme, unstable weights — demonstrated, not just asserted, in §5.5 | Shrinkage estimators (e.g. Ledoit-Wolf covariance shrinkage), additional weight constraints, or a Black-Litterman blend of historical data with independent views |
| ~~No CI/automated data regeneration~~ — **resolved** | Every JSON file used to be regenerated by manually running Python scripts | **Done.** `.github/workflows/refresh-data.yml` runs weeknights at 02:00 UTC (after the TSX close), regenerating `market_data.py` → `momentum_backtest.py` → `risk_dashboard.py` → `validation.py`, then running `check_data.py` — which compares the new JSON against the committed version for shape, end-date regression, vanished tickers, missing benchmarks, implausible new returns, overlap consistency and staleness — and commits only if every check passes. `stress_data.py` is deliberately excluded: its four windows have fixed dates and cannot change. A failed refresh commits nothing, so the previously deployed data stays live; the footer shows a client-side staleness badge if it falls more than four business days behind. |
| ~~Price-index benchmark understated dividends, overstating alpha~~ — **resolved** | **What was wrong:** the CAPM benchmark was `^GSPTSE`, the S&P/TSX Composite, which is a **price index** — it tracks price levels and excludes dividends. Stock returns here come from `auto_adjust=True` closes, which **include** dividends. The two sides of the regression were therefore not measuring the same thing. Alpha is defined as the return a benchmark cannot explain, so the benchmark's entire missing dividend yield was being credited to the stock as if it were skill: every alpha on the site was overstated by roughly `beta × index dividend yield`. **Why it matters:** alpha is the one number on the Risk Dashboard that claims to measure skill, and it was systematically biased upward — in the flattering direction, which is the worst direction for a bias to run. | **Done.** `BENCHMARK_TICKER` is now `XIU.TO` (iShares S&P/TSX 60 Index ETF), whose adjusted closes are total returns on the same dividend-inclusive basis as the stocks. It also tracks the S&P/TSX 60 rather than the broader Composite, matching the index this universe is actually drawn from. Price history reaches back to 1999-10-04, so the 2008 stress window and its 3-year lookback are fully covered (verified: 935/935 trading days). `market_data.json`, `results.json`, `validation.json` and the fixed-window `stress_data.json` were all regenerated together, and `check_data.py` now reads the benchmark from `config.py` instead of hardcoding it, so this class of drift fails the nightly job rather than shipping. **Measured effect** (sector-diverse default preset, equal-weight, 2021-09-28 → 2026-09-28): portfolio alpha fell from **+2.77% to +0.83%**, a **−1.94 pt** correction — close to the `beta × yield` estimate the mechanism predicts (β ≈ 0.72, TSX 60 yield ≈ 2.7%). Per stock: RY +10.90% → +8.19%, ENB +5.06% → +3.22%, CNR −2.96% → −5.60%, BCE −12.00% → −12.88%, ABX +12.88% → +11.29%. Betas shifted too (portfolio 0.719 → 0.734), since the benchmark index itself changed, not only its dividend treatment. |
| No automated test suite | Correctness so far rests on ad hoc mutation tests and cross-checks run during development (see git history), not a repeatable test suite | Port the mutation tests (look-ahead-bias proofs) and closed-form checks (Efficient Frontier, chi-square critical values) into a real `pytest`/`vitest` suite that runs on every change |
| `yfinance` as sole data source (§4) | Unofficial API, no SLA, single point of failure | Out of scope without a paid data vendor; at minimum, the pipeline could fail loudly (it currently does, via `RuntimeError`/warnings) rather than silently, which is already partially true |

---

## 7. Change log

- **2026-09-28** — Strategies tab upgrade, plus one methodology correction.
  (1) **Benchmark corrected from `^GSPTSE` to `XIU.TO` (§6):** the old
  price-index benchmark excluded dividends while stock returns included them,
  inflating every CAPM alpha by roughly the index dividend yield. Default-preset
  portfolio alpha falls from +2.77% to +0.83%. All JSON regenerated together,
  including the fixed-window stress dataset, so nothing compares across the
  change. (2) **Low Volatility strategy added (§2.1)** — monthly rebalance on a
  60-day trailing volatility rank, with the look-ahead boundary asserted on
  every rebalance. (3) **Passive index benchmarks added (§2.1)** — XIU.TO and
  unhedged ZSP.TO, as CAD total-return ETFs rather than price indices.
  (4) **Risk-adjusted comparison and cost-sensitivity panels added** — CAGR,
  volatility, Sharpe, max drawdown and annualized turnover per line, plus
  total return across a cost range and a bisection-solved break-even cost.
- **2026-09-28** — Nightly data refresh added
  (`.github/workflows/refresh-data.yml`) with `check_data.py` as the gate;
  see the resolved row in §6.
- **2026-09-20** — Three corrections. (1) **Basel traffic light fixed
  (§5.4):** was rescaling a long-run average to a 250-day equivalent, which
  understated clustering risk; now evaluates actual 250-observation windows
  and additionally reports the worst rolling window, flagging the case where
  the two zones disagree. (2) **Default stock selection changed (§5.6):**
  from five Canadian banks (0.739 avg pairwise correlation) to five distinct
  sectors (0.222); the banks remain as an explicitly-labelled concentration
  demo preset. (3) **Survivorship caveat surfaced (§6):** the 12-Month
  Momentum outperformance is now caveated adjacent to the headline on the
  Strategies tab, not only in the general limitations section.
- **2026-08-12** — Part 3: this document created; on-site Assumptions &
  Limitations page and data-provenance stamp added; README rewritten.
- **Model Validation Part 2** — historical stress testing added (four fixed
  crisis windows, out-of-sample optimized-portfolio weights, correlation
  breakdown).
- **Model Validation Part 1** — VaR backtesting added (rolling historical/
  parametric VaR, Kupiec/Christoffersen/conditional-coverage tests, Basel
  traffic light).
- **Efficient Frontier** — long-only mean-variance optimizer added
  (projected gradient, verified against closed-form answers).
- **Risk Dashboard** — volatility/Sharpe/drawdown/VaR/ES/correlation/
  Beta-Alpha/rolling-metrics/Monte Carlo added.
- **Strategies** — initial four-strategy backtest and comparison UI.
  (Low Volatility became the fifth in 2026-09-28, above.)
