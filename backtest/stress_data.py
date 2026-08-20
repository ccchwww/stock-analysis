"""
Long-history data for stress testing -- Model Validation tab, Part 2 of 3.

The stress windows (2008 GFC, 2014-16 oil crash, 2020 COVID crash, 2022
rate hikes) are all further back than market_data.json's rolling 5-year
window covers, and each optimized-portfolio estimate additionally needs 3
years of data BEFORE its window opens (see config.py's STRESS_WINDOWS). So
this is a separate, FIXED historical download -- independent of "today" --
covering 2005-01-01 through the end of the latest window, for the same
ticker universe and benchmark as market_data.json.

Unlike market_data.py, this does NOT drop tickers with insufficient
coverage: many of today's TSX 60 names didn't exist (or weren't listed) in
2005-2008, and the whole point of this data is to let the frontend report,
per stress window, how many of the SELECTED tickers actually have data --
silently dropping them here would defeat that. min_history_fraction=0
disables the drop; consumers decide per-window sufficiency themselves.
"""

import json
from pathlib import Path

import pandas as pd

from config import TICKERS, BENCHMARK_TICKER, BENCHMARK_NAME, STRESS_WINDOWS
from data import download_prices, compute_daily_returns
from names import get_name

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = REPO_ROOT / "web" / "public" / "stress_data.json"

# Covers every window's 3-year lookback through its end, with a little
# margin -- see config.py's STRESS_WINDOWS for the exact window dates this
# must contain.
STRESS_DATA_START = "2005-01-01"
STRESS_DATA_END = "2022-10-31"


def load_stress_universe():
    """Same inner-join-with-benchmark pattern as market_data.py's
    load_universe(), but over the fixed long-history range above and with
    no coverage-based ticker dropping (see module docstring)."""
    prices = download_prices(TICKERS, min_history_fraction=0.0, start=STRESS_DATA_START, end=STRESS_DATA_END)

    benchmark_prices_df = download_prices(
        [BENCHMARK_TICKER], min_history_fraction=0.0, start=STRESS_DATA_START, end=STRESS_DATA_END
    )
    if BENCHMARK_TICKER not in benchmark_prices_df.columns:
        raise RuntimeError(f"Failed to download benchmark data for {BENCHMARK_TICKER}")
    benchmark_prices = benchmark_prices_df[BENCHMARK_TICKER]

    common_dates = prices.index.intersection(benchmark_prices.index)
    dropped = len(prices.index.union(benchmark_prices.index)) - len(common_dates)
    if dropped > 0:
        print(f"  Benchmark/stock trading calendars don't fully line up: "
              f"inner-joining drops {dropped} date(s) not present in both.")

    prices = prices.loc[common_dates]
    benchmark_prices = benchmark_prices.loc[common_dates]

    returns = compute_daily_returns(prices)
    benchmark_returns = compute_daily_returns(benchmark_prices)
    return prices, returns, benchmark_returns


def build_stocks_payload(returns):
    stocks = {}
    for ticker in returns.columns:
        stocks[ticker] = {
            "ticker": ticker,
            "name": get_name(ticker),
            "returns": [None if pd.isna(value) else round(float(value), 6) for value in returns[ticker]],
        }
    return stocks


def build_benchmark_payload(benchmark_returns):
    return {
        "ticker": BENCHMARK_TICKER,
        "name": BENCHMARK_NAME,
        "returns": [None if pd.isna(value) else round(float(value), 6) for value in benchmark_returns],
    }


def _report_coverage(prices, dates):
    """Console-only: how many of the STRESS windows' PRE-WINDOW lookback
    periods does each ticker actually have data for -- the same question
    the frontend answers per-selection, just for the whole universe up
    front, so a coverage gap is visible immediately after running this
    script rather than only discovered later in the browser."""
    total_days = len(dates)
    print(f"\nPer-ticker coverage of the full downloaded range ({total_days} trading days, "
          f"{dates[0].date()} to {dates[-1].date()}):")
    coverage = prices.notna().sum().sort_values()
    for ticker, days in coverage.items():
        print(f"  {ticker:<10} {days:>5}/{total_days} days ({days / total_days:.0%})")

    print("\nPer-window pre-window lookback coverage (tickers with ANY data in the 3-year "
          "lookback immediately before each window opens):")
    for window in STRESS_WINDOWS:
        lookback = prices.loc[window["lookback_start"] : window["start"]]
        covered = (lookback.notna().sum() > 0).sum()
        print(f"  {window['label']:<28} lookback {window['lookback_start']} to {window['start']}: "
              f"{covered}/{len(prices.columns)} tickers have any data")


def main():
    prices, returns, benchmark_returns = load_stress_universe()
    valid_tickers = list(prices.columns)
    dates = returns.index
    print(f"\nGot {len(valid_tickers)} tickers, {len(dates)} trading days "
          f"({dates[0].date()} to {dates[-1].date()}), inner-joined with {BENCHMARK_TICKER}.")

    _report_coverage(prices, dates)

    stocks = build_stocks_payload(returns)
    benchmark = build_benchmark_payload(benchmark_returns)

    output = {
        "meta": {
            "tickers_used": valid_tickers,
            "num_tickers": len(valid_tickers),
            "dates": [d.strftime("%Y-%m-%d") for d in dates],
            "date_range": {
                "start": dates[0].strftime("%Y-%m-%d"),
                "end": dates[-1].strftime("%Y-%m-%d"),
            },
        },
        "stocks": stocks,
        "benchmark": benchmark,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote stress data to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
