"""
Canonical TSX 60 market data: one download/clean pipeline, one daily-returns
dataset, shared by both the strategy backtest and the risk dashboard.

Exports FULL daily returns (not weekly-sampled equity curves) per ticker,
aligned by position to a shared `dates` grid. This is what lets the frontend
recompute equity curves, return stats, correlations, and risk metrics for ANY
user-chosen start date -- slicing a daily series is exact; slicing a
weekly-sampled one would lose precision and only support a handful of anchor
points.

Also downloads the CAPM market benchmark (config.BENCHMARK_TICKER) for
Beta/Alpha, inner-joined onto the SAME trading-day calendar as the stocks --
Beta/Alpha need paired (stock, market) observations on the same day, so the
benchmark is exposed the same way every stock is: a daily return series
aligned by position to `dates`, sliceable by the frontend for any start date.

And the passive INDEX BENCHMARKS (config.INDEX_BENCHMARKS) the Strategies
tab plots against the active strategies. These are CAD-listed ETFs, not raw
indices, deliberately: an ETF's auto_adjust close is a total return in
Canadian dollars, so it compares like-for-like against strategy returns
built the same way. See config.py for the full reasoning.

Both momentum_backtest.py and risk_dashboard.py import load_universe() from
here rather than downloading independently, so the two tabs always agree on
the exact ticker set, trading-day calendar, and return values.
"""

import json
from pathlib import Path

import pandas as pd

from config import (
    TICKERS,
    PERIOD,
    MIN_HISTORY_FRACTION,
    BENCHMARK_TICKER,
    BENCHMARK_NAME,
    INDEX_BENCHMARKS,
)
from data import download_prices, compute_daily_returns
from names import get_name

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = REPO_ROOT / "web" / "public" / "market_data.json"


# Every non-stock series downloaded alongside the universe: the CAPM
# benchmark plus each passive index benchmark. dict.fromkeys de-duplicates
# while preserving order -- XIU.TO is currently both the CAPM benchmark and
# the TSX 60 index benchmark, and must only be requested once.
BENCHMARK_TICKERS = list(
    dict.fromkeys([BENCHMARK_TICKER] + [b["ticker"] for b in INDEX_BENCHMARKS])
)


def load_universe():
    """Download + clean the TSX 60 universe AND every benchmark series, then
    inner-join them onto one common trading-day calendar -- Beta/Alpha need
    the stock and benchmark returns paired on the same days, so any date
    missing from either side is dropped from both (logged if it happens;
    in practice the benchmark and TSX-listed stocks share the same trading
    calendar almost exactly).

    Returns (prices, returns, benchmark_returns, index_benchmark_returns):
    prices/returns are the stock universe's DataFrames, benchmark_returns is
    the CAPM benchmark Series, and index_benchmark_returns is a DataFrame
    with one column per config.INDEX_BENCHMARKS ticker. All share the same
    index after the join.
    """
    prices = download_prices(TICKERS, PERIOD, MIN_HISTORY_FRACTION)

    benchmark_prices_df = download_prices(BENCHMARK_TICKERS, PERIOD, MIN_HISTORY_FRACTION)
    # Fail loudly rather than quietly publishing a site with a benchmark line
    # missing: download_prices drops anything under MIN_HISTORY_FRACTION
    # coverage, so a missing column here means the ETF genuinely didn't come
    # back with a usable 5 years.
    missing = [t for t in BENCHMARK_TICKERS if t not in benchmark_prices_df.columns]
    if missing:
        raise RuntimeError(
            f"Failed to download usable benchmark data for: {', '.join(missing)}. "
            f"Expected full {PERIOD} coverage for every benchmark in config.py."
        )
    benchmark_prices = benchmark_prices_df[BENCHMARK_TICKER]

    common_dates = prices.index.intersection(benchmark_prices.index)
    dropped = len(prices.index.union(benchmark_prices.index)) - len(common_dates)
    if dropped > 0:
        print(
            f"  Benchmark/stock trading calendars don't fully line up: "
            f"inner-joining drops {dropped} date(s) not present in both."
        )

    prices = prices.loc[common_dates]
    benchmark_prices = benchmark_prices.loc[common_dates]
    # Reindexed, not inner-joined again: the shared calendar is already
    # fixed by the CAPM benchmark above, and a passive index line missing one
    # day should leave a gap in that line, never drop the day from every
    # stock in the universe.
    index_benchmark_prices = benchmark_prices_df.reindex(common_dates)

    returns = compute_daily_returns(prices)
    benchmark_returns = compute_daily_returns(benchmark_prices)
    index_benchmark_returns = compute_daily_returns(index_benchmark_prices)

    return prices, returns, benchmark_returns, index_benchmark_returns


def build_stocks_payload(returns):
    """Per-ticker daily return series, aligned BY POSITION to returns.index.
    Missing days are null (not dropped, not filled with 0) so consumers can
    tell "no data" apart from "flat day"."""
    stocks = {}
    for ticker in returns.columns:
        stocks[ticker] = {
            "ticker": ticker,
            "name": get_name(ticker),
            "returns": [
                None if pd.isna(value) else round(float(value), 6)
                for value in returns[ticker]
            ],
        }
    return stocks


def build_benchmark_payload(benchmark_returns):
    """Same shape as a stock entry, so the frontend slices/handles it with
    the exact same code path (see web/lib/date-range.ts)."""
    return {
        "ticker": BENCHMARK_TICKER,
        "name": BENCHMARK_NAME,
        "returns": [
            None if pd.isna(value) else round(float(value), 6)
            for value in benchmark_returns
        ],
    }


def build_index_benchmarks_payload(index_benchmark_returns):
    """Passive index benchmark series, same shape as a stock entry so the
    Strategies tab slices them through the identical start-date code path."""
    out = {}
    for benchmark in INDEX_BENCHMARKS:
        series = index_benchmark_returns[benchmark["ticker"]]
        out[benchmark["key"]] = {
            "key": benchmark["key"],
            "ticker": benchmark["ticker"],
            "label": benchmark["label"],
            "description": benchmark["description"],
            "returns": [
                None if pd.isna(value) else round(float(value), 6) for value in series
            ],
        }
    return out


def main():
    prices, returns, benchmark_returns, index_benchmark_returns = load_universe()
    valid_tickers = list(prices.columns)
    print(f"Got data for {len(valid_tickers)} tickers, {len(prices)} trading days "
          f"(inner-joined with {BENCHMARK_TICKER}).")

    dates = returns.index
    stocks = build_stocks_payload(returns)
    benchmark = build_benchmark_payload(benchmark_returns)
    index_benchmarks = build_index_benchmarks_payload(index_benchmark_returns)

    for key, entry in index_benchmarks.items():
        covered = sum(1 for value in entry["returns"] if value is not None)
        print(f"  Index benchmark {entry['ticker']:<10} ({key}): "
              f"{covered}/{len(dates)} days ({covered / len(dates):.0%} coverage).")

    output = {
        "meta": {
            "tickers_used": valid_tickers,
            "num_tickers": len(valid_tickers),
            "period": PERIOD,
            "dates": [d.strftime("%Y-%m-%d") for d in dates],
            "date_range": {
                "start": dates[0].strftime("%Y-%m-%d"),
                "end": dates[-1].strftime("%Y-%m-%d"),
            },
        },
        "stocks": stocks,
        "benchmark": benchmark,
        "index_benchmarks": index_benchmarks,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Wrote market data to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
