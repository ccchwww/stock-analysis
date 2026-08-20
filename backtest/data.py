"""Price data download and return calculation, shared by every strategy."""

import pandas as pd
import yfinance as yf


def download_prices(tickers, period=None, min_history_fraction=0.95, start=None, end=None):
    """Download adjusted daily close prices for all tickers into one DataFrame
    (columns = tickers, index = trading dates).

    Either pass `period` (yfinance's rolling "Ny" window relative to today,
    the existing behavior) OR explicit `start`/`end` dates for a FIXED
    historical range independent of when the script runs -- the stress-test
    windows in stress_data.py need the latter, since "2008-06-18" must mean
    the same thing regardless of today's date.

    Tickers that fail to download at all are skipped with a warning. Tickers
    that download but don't have enough history across the window (recent
    IPOs/spinoffs, delistings, patchy data) are dropped afterward instead of
    being silently included or crashing the run -- dropped names are logged
    with their actual coverage. Pass min_history_fraction=0 to disable this
    drop entirely (stress_data.py wants every ticker kept, with per-window
    coverage reported instead of a blanket drop, since coverage varies by
    ticker AND by which historical window is being asked about).
    """
    if start is not None:
        print(f"Downloading daily data for {len(tickers)} tickers from {start} to {end}...")
    else:
        print(f"Downloading {period} of daily data for {len(tickers)} tickers...")
    raw = yf.download(
        tickers,
        period=period,
        start=start,
        end=end,
        interval="1d",
        auto_adjust=True,   # adjusted close, so splits/dividends don't fake a "gain"
        progress=False,
        group_by="ticker",
    )

    closes = {}
    for t in tickers:
        try:
            closes[t] = raw[t]["Close"]
        except (KeyError, TypeError):
            print(f"  WARNING: no data returned for {t}, skipping")
    prices = pd.DataFrame(closes)
    prices = prices.dropna(how="all")

    if prices.empty:
        return prices

    total_days = len(prices)
    min_required = int(total_days * min_history_fraction)
    coverage = prices.notna().sum()
    insufficient = coverage[coverage < min_required]

    if len(insufficient) > 0:
        print(
            f"  Dropping {len(insufficient)} ticker(s) with insufficient history "
            f"(< {min_history_fraction:.0%} of {total_days} trading days):"
        )
        for ticker, days in insufficient.sort_values().items():
            print(f"    {ticker}: {days}/{total_days} days ({days / total_days:.0%})")
        prices = prices.drop(columns=insufficient.index)

    return prices


def compute_daily_returns(prices):
    """Simple day-over-day pct return per stock. Row N = return realized AT
    day N's close (i.e. known as of day N, not before)."""
    return prices.pct_change()
