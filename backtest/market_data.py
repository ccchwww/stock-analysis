"""
Canonical TSX 60 market data: one download/clean pipeline, one daily-returns
dataset, shared by both the strategy backtest and the risk dashboard.

Exports FULL daily returns (not weekly-sampled equity curves) per ticker,
aligned by position to a shared `dates` grid. This is what lets the frontend
recompute equity curves, return stats, correlations, and risk metrics for ANY
user-chosen start date -- slicing a daily series is exact; slicing a
weekly-sampled one would lose precision and only support a handful of anchor
points.

Also downloads the S&P/TSX Composite Index as the market benchmark for
Beta/Alpha, inner-joined onto the SAME trading-day calendar as the stocks --
Beta/Alpha need paired (stock, market) observations on the same day, so the
benchmark is exposed the same way every stock is: a daily return series
aligned by position to `dates`, sliceable by the frontend for any start date.

Both momentum_backtest.py and risk_dashboard.py import load_universe() from
here rather than downloading independently, so the two tabs always agree on
the exact ticker set, trading-day calendar, and return values.
"""

import json
from pathlib import Path

import pandas as pd

from config import TICKERS, PERIOD, MIN_HISTORY_FRACTION, BENCHMARK_TICKER, BENCHMARK_NAME
from data import download_prices, compute_daily_returns
from names import get_name

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = REPO_ROOT / "web" / "public" / "market_data.json"


def load_universe():
    """Download + clean the TSX 60 universe AND the market benchmark, then
    inner-join them onto one common trading-day calendar -- Beta/Alpha need
    the stock and benchmark returns paired on the same days, so any date
    missing from either side is dropped from both (logged if it happens;
    in practice the benchmark and TSX-listed stocks share the same trading
    calendar almost exactly).

    Returns (prices, returns, benchmark_returns): prices/returns are the
    stock universe's DataFrames, benchmark_returns is a Series -- all three
    share the same index after the join.
    """
    prices = download_prices(TICKERS, PERIOD, MIN_HISTORY_FRACTION)

    benchmark_prices_df = download_prices([BENCHMARK_TICKER], PERIOD, MIN_HISTORY_FRACTION)
    if BENCHMARK_TICKER not in benchmark_prices_df.columns:
        raise RuntimeError(f"Failed to download benchmark data for {BENCHMARK_TICKER}")
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

    returns = compute_daily_returns(prices)
    benchmark_returns = compute_daily_returns(benchmark_prices)

    return prices, returns, benchmark_returns


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


def main():
    prices, returns, benchmark_returns = load_universe()
    valid_tickers = list(prices.columns)
    print(f"Got data for {len(valid_tickers)} tickers, {len(prices)} trading days "
          f"(inner-joined with {BENCHMARK_TICKER}).")

    dates = returns.index
    stocks = build_stocks_payload(returns)
    benchmark = build_benchmark_payload(benchmark_returns)

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
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Wrote market data to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
