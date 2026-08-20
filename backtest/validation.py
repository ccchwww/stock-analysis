"""
VaR Backtesting (Part 1) + Stress Testing config (Part 2) -- Model
Validation tab.

Tests whether the historical VaR shown on the Risk Dashboard (and its
parametric counterpart) is actually well-calibrated, over a strictly
out-of-sample rolling 250-day window, using the Kupiec, Christoffersen, and
conditional-coverage likelihood-ratio tests.

Like risk_dashboard.py, this script's job is NOT to precompute the backtest
for one fixed window -- it's to serialize the ASSUMPTIONS/CONFIG (window
size, confidence levels, Basel zone boundaries, chi-square critical values,
methodology notes) to web/public/validation.json. The actual backtest
(rolling VaR, exception detection, the three tests) is computed CLIENT-SIDE
in web/lib/var-backtest.ts, driven by market_data.json's daily returns --
exactly like every other Risk Dashboard metric -- because it must recompute
instantly whenever the user changes the start date or stock selection, and
this project has no backend/API route to recompute it server-side on demand.

This script ALSO runs the identical math independently in Python (using
scipy for exact p-values) against the full-history, full-universe
equal-weight portfolio, and prints a full report to the console. This is
both the requested sanity-check output and a cross-check that the
TypeScript port's numbers agree with an independent, scipy-verified
reference implementation -- reading the ALREADY-WRITTEN market_data.json
(run market_data.py first) rather than re-downloading via load_universe(),
so this check and the live frontend are guaranteed to see byte-identical
data. Re-fetching independently would let two separate yfinance calls
silently disagree by a few trading days at the edges (a real, if harmless,
data-freshness sanity trap that showed up in dev: NOT a bug in the VaR math
itself, but confusing to cross-check against if left in).
"""

import json
import math
from pathlib import Path

import numpy as np

try:
    from scipy.stats import chi2 as scipy_chi2

    HAVE_SCIPY = True
except ImportError:
    HAVE_SCIPY = False

from config import STRESS_WINDOWS, STRESS_LOOKBACK_YEARS, STRESS_MIN_COVERAGE_FRACTION

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = REPO_ROOT / "web" / "public" / "validation.json"
MARKET_DATA_PATH = REPO_ROOT / "web" / "public" / "market_data.json"
STRESS_DATA_PATH = REPO_ROOT / "web" / "public" / "stress_data.json"

# Console sanity-check for the stress-test section uses this fixed selection
# -- the same default the frontend starts with -- rather than the full
# universe, since the whole point of the section is per-stock behavior, not
# a blended aggregate.
STRESS_REFERENCE_TICKERS = ["RY.TO", "TD.TO", "BNS.TO", "BMO.TO", "CM.TO"]

# Day t's VaR uses ONLY returns[t-250 .. t-1] -- see rolling_historical_var /
# rolling_parametric_var below, which never index t itself.
VAR_WINDOW_DAYS = 250
CONFIDENCE_LEVELS = [0.95, 0.99]
Z_SCORES = {0.95: -1.645, 0.99: -2.326}
CHI2_CRITICAL_95 = {1: 3.841, 2: 5.991}


# --- Rolling VaR (mirrors web/lib/var-backtest.ts exactly) -----------------


def _clean(values):
    return [float(v) for v in values if v is not None and not (isinstance(v, float) and math.isnan(v))]


def historical_var(window, confidence):
    """Empirical tail-cutoff percentile -- the SAME formula as the static
    historicalVaR() the Risk Dashboard shows, applied to one rolling window."""
    clean = sorted(_clean(window))
    if not clean:
        return None
    alpha = 1 - confidence
    n = len(clean)
    idx = min(n - 1, max(0, int(math.floor(alpha * n))))
    return -clean[idx]


def rolling_historical_var(returns, confidence, window=VAR_WINDOW_DAYS):
    n = len(returns)
    out = [None] * n
    for t in range(window, n):
        out[t] = historical_var(returns[t - window : t], confidence)
    return out


def _window_mean_std(window):
    clean = _clean(window)
    if len(clean) < 2:
        return None
    return float(np.mean(clean)), float(np.std(clean, ddof=1))


def rolling_parametric_var(returns, confidence, window=VAR_WINDOW_DAYS):
    z = Z_SCORES[confidence]
    n = len(returns)
    out = [None] * n
    for t in range(window, n):
        stats = _window_mean_std(returns[t - window : t])
        if stats is None:
            continue
        mean, std = stats
        out[t] = -(mean + z * std)
    return out


# --- Statistical tests -------------------------------------------------


def chi2_sf(x, df):
    if HAVE_SCIPY:
        return float(scipy_chi2.sf(max(0.0, x), df))
    return None  # caller falls back to critical-value-only pass/fail


def _safe_log_term(count, prob):
    """count * ln(prob), with 0 * ln(anything) = 0 -- avoids ln(0) = -inf
    producing NaN when a zero count meets a zero/one probability (e.g. zero
    exceptions, or zero consecutive exceptions)."""
    if count == 0:
        return 0.0
    return count * math.log(prob)


def kupiec_test(n, x, nominal_p):
    pi_hat = x / n if n > 0 else 0.0
    log_num = _safe_log_term(n - x, 1 - nominal_p) + _safe_log_term(x, nominal_p)
    log_denom = _safe_log_term(n - x, 1 - pi_hat) + _safe_log_term(x, pi_hat)
    statistic = max(0.0, -2 * (log_num - log_denom))
    return {
        "statistic": statistic,
        "p_value": chi2_sf(statistic, 1),
        "critical_value": CHI2_CRITICAL_95[1],
        "df": 1,
        "reject": statistic > CHI2_CRITICAL_95[1],
    }


def christoffersen_test(exceptions):
    n00 = n01 = n10 = n11 = 0
    for i in range(1, len(exceptions)):
        prev, curr = exceptions[i - 1], exceptions[i]
        if not prev and not curr:
            n00 += 1
        elif not prev and curr:
            n01 += 1
        elif prev and not curr:
            n10 += 1
        else:
            n11 += 1
    n0, n1 = n00 + n01, n10 + n11
    n_total = n0 + n1
    pi0 = n01 / n0 if n0 > 0 else 0.0
    pi1 = n11 / n1 if n1 > 0 else 0.0
    pi = (n01 + n11) / n_total if n_total > 0 else 0.0

    log_num = _safe_log_term(n00 + n10, 1 - pi) + _safe_log_term(n01 + n11, pi)
    log_denom = (
        _safe_log_term(n00, 1 - pi0)
        + _safe_log_term(n01, pi0)
        + _safe_log_term(n10, 1 - pi1)
        + _safe_log_term(n11, pi1)
    )
    statistic = max(0.0, -2 * (log_num - log_denom))
    return {
        "statistic": statistic,
        "p_value": chi2_sf(statistic, 1),
        "critical_value": CHI2_CRITICAL_95[1],
        "df": 1,
        "reject": statistic > CHI2_CRITICAL_95[1],
        "transition_counts": {"n00": n00, "n01": n01, "n10": n10, "n11": n11},
    }


def conditional_coverage_test(kupiec, christoffersen):
    statistic = kupiec["statistic"] + christoffersen["statistic"]
    return {
        "statistic": statistic,
        "p_value": chi2_sf(statistic, 2),
        "critical_value": CHI2_CRITICAL_95[2],
        "df": 2,
        "reject": statistic > CHI2_CRITICAL_95[2],
    }


def skew_kurtosis(clean):
    n = len(clean)
    if n < 3:
        return None, None
    mean = float(np.mean(clean))
    d = np.asarray(clean) - mean
    m2, m3, m4 = float(np.mean(d**2)), float(np.mean(d**3)), float(np.mean(d**4))
    if m2 == 0:
        return 0.0, 0.0
    return m3 / (m2**1.5), m4 / (m2**2) - 3


def basel_zone(scaled_exceptions):
    rounded = round(scaled_exceptions)
    if rounded <= 4:
        return "green"
    if rounded <= 9:
        return "yellow"
    return "red"


# --- Stress testing (Part 2) -- independent reference check ----------------
#
# Mirrors web/lib/stress-test.ts's per-stock/equal-weight/benchmark/
# correlation math (NOT the min-variance/max-Sharpe optimizer itself -- that
# was already verified against closed-form answers when the Efficient
# Frontier feature was built; re-deriving the same projected-gradient
# optimizer here in Python would duplicate a lot of code without adding
# cross-verification value beyond what already exists). This gives an
# independent check on the simpler, but equally look-ahead-sensitive, parts:
# window slicing, drawdown/vol/total-return, and the correlation breakdown.


def slice_window(dates, returns, start, end):
    start_idx = next((i for i, d in enumerate(dates) if d >= start), None)
    if start_idx is None:
        return []
    end_idx = next((i for i in range(len(dates) - 1, -1, -1) if dates[i] <= end), -1)
    if end_idx < start_idx:
        return []
    return returns[start_idx : end_idx + 1]


def max_drawdown(returns):
    clean = _clean(returns)
    if not clean:
        return None
    value = peak = 1.0
    worst = 0.0
    for r in clean:
        value *= 1 + r
        peak = max(peak, value)
        worst = min(worst, value / peak - 1)
    return worst


def annualized_vol(returns, trading_days):
    clean = _clean(returns)
    if len(clean) < 2:
        return None
    return float(np.std(clean, ddof=1) * math.sqrt(trading_days))


def compute_window_stats(returns, trading_days):
    clean = _clean(returns)
    if not clean:
        return None
    compounded = 1.0
    for r in clean:
        compounded *= 1 + r
    return {
        "total_return": compounded - 1,
        "max_drawdown": max_drawdown(returns) or 0.0,
        "annualized_volatility": annualized_vol(returns, trading_days) or 0.0,
        "worst_day": min(clean),
        "n": len(clean),
        "coverage_fraction": len(clean) / len(returns) if returns else 0.0,
    }


def pearson_correlation(a, b):
    pairs = [
        (x, y)
        for x, y in zip(a, b)
        if x is not None and y is not None and not (isinstance(x, float) and math.isnan(x))
    ]
    if len(pairs) < 2:
        return None
    xs, ys = np.array([p[0] for p in pairs]), np.array([p[1] for p in pairs])
    if xs.std() == 0 or ys.std() == 0:
        return None
    return float(np.corrcoef(xs, ys)[0, 1])


def average_pairwise_correlation(tickers, dates, returns_by_ticker, predicate):
    if len(tickers) < 2:
        return None, 0
    filtered = {
        t: [r for d, r in zip(dates, returns_by_ticker[t]) if predicate(d)] for t in tickers
    }
    total, count = 0.0, 0
    for i in range(len(tickers)):
        for j in range(i + 1, len(tickers)):
            corr = pearson_correlation(filtered[tickers[i]], filtered[tickers[j]])
            if corr is not None:
                total += corr
                count += 1
    return (total / count if count > 0 else None), count


def _load_stress_data():
    if not STRESS_DATA_PATH.exists():
        raise SystemExit(f"{STRESS_DATA_PATH} not found -- run `python stress_data.py` first.")
    with open(STRESS_DATA_PATH) as f:
        return json.load(f)


def run_stress_reference_report(trading_days=252):
    stress_data = _load_stress_data()
    dates = stress_data["meta"]["dates"]
    stocks = stress_data["stocks"]
    benchmark_returns = stress_data["benchmark"]["returns"]
    tickers = [t for t in STRESS_REFERENCE_TICKERS if t in stocks]

    print(f"\n{'=' * 78}")
    print(f"Stress Test Reference Check: {tickers}")
    print(f"{'=' * 78}")
    print(f"Long-history range: {dates[0]} to {dates[-1]} ({len(dates)} trading days)")

    def in_any_window(d):
        return any(w["start"] <= d <= w["end"] for w in STRESS_WINDOWS)

    baseline_corr, baseline_n = average_pairwise_correlation(
        tickers, dates, {t: stocks[t]["returns"] for t in tickers}, lambda d: not in_any_window(d)
    )
    print(f"\nBaseline correlation (full sample excluding all 4 stress windows, n={baseline_n} pairs): "
          f"{baseline_corr:.3f}" if baseline_corr is not None else "\nBaseline correlation: n/a")

    for window in STRESS_WINDOWS:
        print(f"\n--- {window['label']} ({window['start']} to {window['end']}) ---")
        print(f"{'Entity':<14}{'Return':>10}{'MaxDD':>10}{'AnnVol':>10}{'WorstDay':>10}{'N':>7}{'Coverage':>10}")

        covered = []
        for t in tickers:
            window_returns = slice_window(dates, stocks[t]["returns"], window["start"], window["end"])
            clean_count = len(_clean(window_returns))
            coverage = clean_count / len(window_returns) if window_returns else 0.0
            stats = compute_window_stats(window_returns, trading_days) if coverage >= STRESS_MIN_COVERAGE_FRACTION else None
            if stats:
                covered.append(t)
                print(f"{t:<14}{stats['total_return'] * 100:>9.1f}%{stats['max_drawdown'] * 100:>9.1f}%"
                      f"{stats['annualized_volatility'] * 100:>9.1f}%{stats['worst_day'] * 100:>9.2f}%{stats['n']:>7}{coverage:>9.0%}")
            else:
                print(f"{t:<14}{'N/A (insufficient coverage: ' + f'{coverage:.0%}' + ')':>56}")

        if covered:
            window_series = {t: slice_window(dates, stocks[t]["returns"], window["start"], window["end"]) for t in covered}
            n_window = len(next(iter(window_series.values())))
            eq_returns = []
            for i in range(n_window):
                vals = [window_series[t][i] for t in covered if window_series[t][i] is not None]
                eq_returns.append(sum(vals) / len(vals) if vals else None)
            eq_stats = compute_window_stats(eq_returns, trading_days)
            if eq_stats:
                print(f"{'EqualWeight':<14}{eq_stats['total_return'] * 100:>9.1f}%{eq_stats['max_drawdown'] * 100:>9.1f}%"
                      f"{eq_stats['annualized_volatility'] * 100:>9.1f}%{eq_stats['worst_day'] * 100:>9.2f}%{eq_stats['n']:>7}")

        bench_returns = slice_window(dates, benchmark_returns, window["start"], window["end"])
        bench_stats = compute_window_stats(bench_returns, trading_days)
        if bench_stats:
            print(f"{'Benchmark':<14}{bench_stats['total_return'] * 100:>9.1f}%{bench_stats['max_drawdown'] * 100:>9.1f}%"
                  f"{bench_stats['annualized_volatility'] * 100:>9.1f}%{bench_stats['worst_day'] * 100:>9.2f}%{bench_stats['n']:>7}")

        lookback_coverage = []
        for t in tickers:
            lb = slice_window(dates, stocks[t]["returns"], window["lookback_start"], window["start"])
            frac = len(_clean(lb)) / len(lb) if lb else 0.0
            lookback_coverage.append((t, frac))
        qualifying = [t for t, f in lookback_coverage if f >= STRESS_MIN_COVERAGE_FRACTION]
        print(f"Pre-window lookback ({window['lookback_start']} to {window['start']}) coverage: "
              + ", ".join(f"{t}={f:.0%}" for t, f in lookback_coverage))
        if len(qualifying) < 2:
            print(f"Min-variance/Max-Sharpe: N/A -- insufficient pre-window data ({len(qualifying)}/{len(tickers)} qualify)")
        else:
            print(f"Min-variance/Max-Sharpe: {len(qualifying)}/{len(tickers)} tickers qualify for out-of-sample "
                  f"weight estimation -- computed client-side (web/lib/efficient-frontier.ts + stress-test.ts), "
                  f"not re-implemented here (see module docstring above).")

        stress_corr, stress_n = average_pairwise_correlation(
            tickers, dates, {t: stocks[t]["returns"] for t in tickers}, lambda d: window["start"] <= d <= window["end"]
        )
        if stress_corr is not None and baseline_corr is not None:
            delta = stress_corr - baseline_corr
            print(f"Correlation: baseline {baseline_corr:.3f} vs stress-window {stress_corr:.3f} "
                  f"(n={stress_n} pairs) -- {'+' if delta >= 0 else ''}{delta:.3f} "
                  f"{'(correlation ROSE during the crisis)' if delta > 0 else ''}")


# --- Console reference report --------------------------------------------


def _fmt_test(test):
    p = f"{test['p_value']:.4f}" if test["p_value"] is not None else "n/a"
    verdict = "REJECT" if test["reject"] else "pass"
    return f"{test['statistic']:6.2f} / p={p:<7} / {verdict}"


def run_reference_backtest(returns, dates, label):
    print(f"\n{'=' * 78}")
    print(f"VaR Backtest Reference Check: {label}")
    print(f"{'=' * 78}")
    n_total = len(returns)
    print(f"Full history: {n_total} trading days ({dates[0]} to {dates[-1]})")
    print(f"Warmup: first {VAR_WINDOW_DAYS} days seed the rolling window only -- no VaR computed for them.")
    print(f"scipy available: {HAVE_SCIPY}")

    clean_backtest_window = _clean(returns[VAR_WINDOW_DAYS:])
    skewness, excess_kurtosis = skew_kurtosis(clean_backtest_window)
    print(f"\nSkewness (backtest window, n={len(clean_backtest_window)}): {skewness:.4f}")
    print(f"Excess kurtosis: {excess_kurtosis:.4f}  (a normal distribution has excess kurtosis 0)")

    series_by_key = {}
    for confidence in CONFIDENCE_LEVELS:
        series_by_key[("historical", confidence)] = rolling_historical_var(returns, confidence)
        series_by_key[("parametric", confidence)] = rolling_parametric_var(returns, confidence)

    print(
        f"\n{'Method':<12}{'Conf':>6}{'N':>7}{'Exceptions':>12}{'Expected':>10}{'Rate':>9}   "
        f"{'Kupiec':<20}{'Christoffersen':<20}{'Cond. Coverage':<20}"
    )
    results = {}
    for method in ("historical", "parametric"):
        for confidence in CONFIDENCE_LEVELS:
            series = series_by_key[(method, confidence)]
            exceptions_seq = []
            for i in range(n_total):
                actual, var_value = returns[i], series[i]
                if var_value is None or (isinstance(actual, float) and math.isnan(actual)):
                    continue
                exceptions_seq.append(bool(actual < -var_value))
            n = len(exceptions_seq)
            x = sum(exceptions_seq)
            nominal_p = 1 - confidence
            kupiec = kupiec_test(n, x, nominal_p)
            christoffersen = christoffersen_test(exceptions_seq)
            cc = conditional_coverage_test(kupiec, christoffersen)
            rate = x / n if n > 0 else 0.0
            expected = n * nominal_p

            results[f"{method}_{confidence}"] = {
                "n": n,
                "exceptions": x,
                "expected_exceptions": expected,
                "exception_rate": rate,
                "kupiec": kupiec,
                "christoffersen": christoffersen,
                "conditional_coverage": cc,
            }
            print(
                f"{method:<12}{confidence:>6.2f}{n:>7}{x:>12}{expected:>10.1f}{rate * 100:>8.2f}%   "
                f"{_fmt_test(kupiec):<20}{_fmt_test(christoffersen):<20}{_fmt_test(cc):<20}"
            )

    h99 = results["historical_0.99"]
    scaled = h99["exceptions"] * (VAR_WINDOW_DAYS / h99["n"]) if h99["n"] > 0 else 0.0
    zone = basel_zone(scaled)
    print(f"\nBasel traffic light (99% historical VaR, scaled to {VAR_WINDOW_DAYS} obs): "
          f"{scaled:.2f} exceptions -> {zone.upper()}")
    print("(Basel zones apply ONLY to 99% VaR over 250 observations -- never evaluated at 95%.)")

    p95 = results["parametric_0.95"]["exception_rate"]
    h95 = results["historical_0.95"]["exception_rate"]
    p99 = results["parametric_0.99"]["exception_rate"]
    h99_rate = results["historical_0.99"]["exception_rate"]
    print(f"\nHistorical vs parametric exception rate: "
          f"95% [{h95 * 100:.2f}% hist vs {p95 * 100:.2f}% param], "
          f"99% [{h99_rate * 100:.2f}% hist vs {p99 * 100:.2f}% param]")
    if p99 > h99_rate and p99 > 0.01:
        print("Parametric VaR is breached MORE than its nominal 1% at 99% (and more than historical) "
              "-- consistent with fat-tailed equity returns, the motivation for volatility modelling (GARCH).")

    return results


def _load_market_data():
    if not MARKET_DATA_PATH.exists():
        raise SystemExit(
            f"{MARKET_DATA_PATH} not found -- run `python market_data.py` first "
            "(this script reads it rather than re-downloading, so the console "
            "sanity check and the live frontend always see identical data)."
        )
    with open(MARKET_DATA_PATH) as f:
        return json.load(f)


def main():
    market_data = _load_market_data()
    dates = market_data["meta"]["dates"]
    tickers = market_data["meta"]["tickers_used"]
    stocks = market_data["stocks"]

    # Equal-weight portfolio across the full universe -- redistributes
    # weight across whichever tickers have data that day, same semantics as
    # combineEqualWeight() in web/lib/returns-math.ts.
    portfolio_returns = []
    for i in range(len(dates)):
        values = [stocks[t]["returns"][i] for t in tickers if stocks[t]["returns"][i] is not None]
        portfolio_returns.append(sum(values) / len(values) if values else None)

    run_reference_backtest(portfolio_returns, dates, "Equal-weight portfolio (full universe, full history)")

    if STRESS_DATA_PATH.exists():
        run_stress_reference_report()
    else:
        print(f"\n(Skipping stress-test reference report -- {STRESS_DATA_PATH} not found. "
              f"Run `python stress_data.py` to generate it.)")

    output = {
        "meta": {
            "var_window_days": VAR_WINDOW_DAYS,
            "confidence_levels": CONFIDENCE_LEVELS,
            "z_scores": {str(c): Z_SCORES[c] for c in CONFIDENCE_LEVELS},
            "chi2_critical_95": {"df1": CHI2_CRITICAL_95[1], "df2": CHI2_CRITICAL_95[2]},
            "basel_zones": [
                {"zone": "green", "max_exceptions": 4},
                {"zone": "yellow", "max_exceptions": 9},
                {"zone": "red", "max_exceptions": None},
            ],
            "methodology_note": (
                "Rolling 250-trading-day window, strictly out-of-sample: VaR for "
                "day t uses only returns from [t-250, t-1], never day t itself. "
                "Historical VaR re-applies the exact same empirical tail-cutoff "
                "formula shown on the Risk Dashboard, just over each trailing "
                "window instead of the whole selected period. Parametric "
                "(normal / variance-covariance) VaR uses the same window's mean "
                "and standard deviation with a standard-normal z-score."
            ),
            "warmup_note": (
                "Backtesting from a chosen start date requires 250+ trading days "
                "of history before it, fetched automatically -- the start-date "
                "control on this tab will not let you pick a date without a full "
                "warmup period, rather than silently running on a shorter sample."
            ),
            "basel_note": (
                "Basel traffic-light zones (green 0-4, yellow 5-9, red 10+ "
                "exceptions) are defined for 99% VaR over 250 observations. The "
                "95% series is shown for calibration testing only and is not "
                "evaluated against Basel zones -- at 95%, roughly 12.5 exceptions "
                "per 250 days is the EXPECTED result for a well-calibrated model, "
                "so applying these zones there would flag a correct model as red."
            ),
            "fat_tail_note": (
                "If parametric VaR is breached more often than its nominal level "
                "-- especially at 99% -- that is the expected finding: equity "
                "returns have fatter tails than a normal distribution assumes. "
                "This is the empirical motivation for volatility models (e.g. "
                "GARCH) that let the variance itself change over time, rather "
                "than assuming one constant normal distribution."
            ),
        },
        "stress": {
            "windows": STRESS_WINDOWS,
            "lookback_years": STRESS_LOOKBACK_YEARS,
            "min_coverage_fraction": STRESS_MIN_COVERAGE_FRACTION,
            "fixed_window_note": (
                "These 4 windows use FIXED historical dates and are completely "
                "independent of the start-date control above -- changing the "
                "start date affects the VaR backtest only, never this section."
            ),
            "lookahead_note": (
                "The minimum-variance and maximum-Sharpe portfolios shown per "
                "window are estimated using ONLY the "
                f"{STRESS_LOOKBACK_YEARS} years of data immediately BEFORE each "
                "window opens, then held fixed (no rebalancing) through the "
                "window itself. If fewer than 2 of the selected stocks have "
                "sufficient data in that lookback period, the optimized "
                "portfolios are reported as unavailable for that window rather "
                "than silently falling back to a look-ahead-contaminated, "
                "in-sample estimate."
            ),
            "survivorship_note": (
                "Many of today's TSX 60 constituents did not exist, or were not "
                "yet listed, during the earlier windows (2008 especially) -- "
                "survivorship bias is materially worse here than elsewhere on "
                "this site, since today's constituent list is being projected "
                "onto history it didn't live through. Per-window ticker "
                "coverage is reported explicitly rather than silently excluding "
                "names with insufficient data."
            ),
            "correlation_baseline_note": (
                "Baseline correlation is the average pairwise correlation of "
                "daily returns over the FULL downloaded sample, EXCLUDING all "
                "4 stress windows above (not a specific calm sub-period) -- "
                "compared against the average pairwise correlation during each "
                "window alone. Diversification benefits are calibrated on the "
                "baseline (calm-period) correlations, and shrink exactly when "
                "they're most needed if correlations rise during the crisis, "
                "which mean-variance optimization -- itself calibrated on "
                "calm-period data via the same lookback -- has no way to see "
                "coming."
            ),
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote validation config to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
