"""
Strategy comparison backtest (S&P/TSX 60 universe).

Runs four strategies over the same Canadian large-cap universe and 5-year
window so they're directly comparable, then writes each strategy's FULL daily
return series to web/public/results.json.

Why daily returns instead of precomputed weekly equity curves/stats: the
frontend lets the user pick an arbitrary start date (any date within the
available window), and every metric -- equity curve, total return, up-rate,
avg return -- must recompute from that date. A strategy's daily return on a
given historical day is a fixed fact once computed (it doesn't depend on
which start date you later choose to VIEW from), so exporting the full daily
series lets the frontend slice-and-recompound for any window without
re-deriving the look-ahead-bias-sensitive selection logic in JavaScript.
engine.py's equity-curve/summary-stat helpers are still used below, but only
for the console printout -- the frontend is the single source of truth for
what's actually displayed.

Strategies:
  1. 1-Day Momentum   - buy yesterday's top-10 gainers, hold 1 day.
  2. 12-Month Momentum- buy the top-10 by trailing ~12-month return, rebalance monthly.
  3. Mean Reversion   - buy yesterday's 10 biggest losers, hold 1 day.
  4. Buy & Hold       - equal-weight all tickers, hold the whole period (the benchmark).

Look-ahead bias: every strategy's selection step uses only data known as of
the selection date's close; performance is always scored using a later,
out-of-sample date. See docstrings in strategies.py for how each one does this.

Transaction costs: every strategy pays COST_BPS (config.py) per trade,
charged against its actual turnover -- see costs.py and strategies.py.
"""

import json
from pathlib import Path

import pandas as pd

from config import PERIOD, TOP_N, MOMENTUM_LOOKBACK_DAYS, INITIAL_CAPITAL, COST_BPS
from market_data import load_universe
from engine import build_equity_curve, summarize_period_returns, total_return_from_equity
from strategies import momentum_1day, mean_reversion, momentum_12month, buy_and_hold

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = REPO_ROOT / "web" / "public" / "results.json"

# (id, label, description) in the order the frontend should display them.
STRATEGY_ORDER = [
    ("momentum_1d", "1-Day Momentum", "Buy yesterday's top-10 gainers, hold 1 day."),
    ("momentum_12m", "12-Month Momentum", "Buy the top-10 by trailing 12-month return, rebalance monthly."),
    ("mean_reversion", "Mean Reversion", "Buy yesterday's 10 biggest losers, hold 1 day."),
    ("buy_hold", "Buy & Hold", "Equal-weight all tickers, held for the full period (benchmark)."),
]


def run_strategy(key, prices, returns, top_n):
    if key == "momentum_1d":
        return momentum_1day(returns, top_n, COST_BPS)
    if key == "mean_reversion":
        return mean_reversion(returns, top_n, COST_BPS)
    if key == "momentum_12m":
        return momentum_12month(prices, returns, top_n, MOMENTUM_LOOKBACK_DAYS, COST_BPS)
    if key == "buy_hold":
        return buy_and_hold(returns, COST_BPS)
    raise ValueError(f"Unknown strategy: {key}")


def print_comparison_table(strategies_raw, dates):
    """Console-only sanity check, computed via engine.py's full-window
    summary helpers. The frontend independently recomputes the same
    quantities from daily_returns for whatever start date is selected."""
    print(f"\nStrategy Comparison (net of a {COST_BPS:.0f} bps/trade cost assumption)")
    print(f"{'Strategy':<20}{'Up-Rate':>10}{'Avg Return':>14}{'Total Return':>16}{'Final Value':>16}")
    print("-" * 76)
    for key, label, _ in STRATEGY_ORDER:
        raw = strategies_raw[key]
        equity = build_equity_curve(dates, raw["daily_portfolio_return"], INITIAL_CAPITAL)
        metrics = summarize_period_returns(raw["period_returns"])
        total_return = total_return_from_equity(equity)
        final_value = float(equity.iloc[-1]) if len(equity) else INITIAL_CAPITAL

        up_rate = f"{metrics['up_rate']:.2%}" if metrics["up_rate"] is not None else "n/a"
        avg_return = f"{metrics['avg_return']:.4%}" if metrics["avg_return"] is not None else "n/a"
        print(f"{label:<20}{up_rate:>10}{avg_return:>14}{total_return:>15.2%} {final_value:>14,.2f}")


def main():
    prices, returns, _benchmark_returns = load_universe()
    valid_tickers = list(prices.columns)
    print(f"Got data for {len(valid_tickers)} tickers, {len(prices)} trading days.")

    dates = returns.index

    print("Running 4 strategies (no look-ahead: each selection uses only data "
          "known as of its own date; outcomes are always scored forward)...")

    strategies_raw = {}
    strategies_out = {}
    for key, label, description in STRATEGY_ORDER:
        raw = run_strategy(key, prices, returns, TOP_N)
        strategies_raw[key] = raw
        strategies_out[key] = {
            "id": key,
            "label": label,
            "description": description,
            "daily_returns": [
                None if pd.isna(value) else round(float(value), 6)
                for value in raw["daily_portfolio_return"]
            ],
        }

    output = {
        "meta": {
            "tickers_used": valid_tickers,
            "num_tickers": len(valid_tickers),
            "period": PERIOD,
            "top_n": TOP_N,
            "momentum_lookback_days": MOMENTUM_LOOKBACK_DAYS,
            "initial_capital": INITIAL_CAPITAL,
            "cost_bps": COST_BPS,
            "cost_note": (
                f"Assumes {COST_BPS:.0f} bps per trade (one-way), charged on each "
                "strategy's actual turnover. Real-world slippage -- typically "
                "wider on less liquid names -- would add to this and isn't "
                "separately modeled."
            ),
            "dates": [d.strftime("%Y-%m-%d") for d in dates],
            "date_range": {
                "start": dates[0].strftime("%Y-%m-%d"),
                "end": dates[-1].strftime("%Y-%m-%d"),
            },
            "strategy_order": [key for key, _, _ in STRATEGY_ORDER],
        },
        "strategies": strategies_out,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote results to {OUTPUT_PATH}")
    print_comparison_table(strategies_raw, dates)


if __name__ == "__main__":
    main()
