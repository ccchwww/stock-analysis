"""
Strategy comparison backtest (S&P/TSX 60 universe).

Runs five strategies over the same Canadian large-cap universe and 5-year
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
  4. Low Volatility   - buy the 10 lowest trailing-60-day-vol names, rebalance monthly.
  5. Buy & Hold       - equal-weight all tickers, hold the whole period (the benchmark).

Look-ahead bias: every strategy's selection step uses only data known as of
the selection date's close; performance is always scored using a later,
out-of-sample date. See docstrings in strategies.py for how each one does this.

Transaction costs: every strategy pays COST_BPS (config.py) per trade,
charged against its actual turnover -- see costs.py and strategies.py.

Each strategy's per-day TURNOVER is exported alongside its net returns. Cost
enters a return purely as `turnover * bps/10_000`, and no strategy's
selection rule reads cost_bps, so net return is an exact linear function of
the cost level. That identity is what powers the Strategies tab's cost-
sensitivity panel and its break-even solver: the frontend re-prices any
strategy at any bps from the stored (return, turnover) pair rather than
needing a separate backtest per cost scenario. `_verify_cost_linearity`
below re-checks it against genuine re-runs on every refresh, so the claim
can never silently rot.
"""

import json
from pathlib import Path

import pandas as pd

from config import (
    PERIOD,
    TOP_N,
    MOMENTUM_LOOKBACK_DAYS,
    INITIAL_CAPITAL,
    COST_BPS,
    LOW_VOL_LOOKBACK_DAYS,
    LOW_VOL_MIN_COVERAGE_FRACTION,
)
from market_data import load_universe
from engine import build_equity_curve, summarize_period_returns, total_return_from_equity
from names import get_name
from strategies import (
    momentum_1day,
    mean_reversion,
    momentum_12month,
    low_volatility,
    buy_and_hold,
)

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = REPO_ROOT / "web" / "public" / "results.json"

# (id, label, description, rebalance cadence) in the order the frontend
# should display them. The cadence string is data for the UI's turnover
# column, not decoration -- it says how often the strategy actually trades.
STRATEGY_ORDER = [
    ("momentum_1d", "1-Day Momentum", "Buy yesterday's top-10 gainers, hold 1 day.", "daily"),
    ("momentum_12m", "12-Month Momentum", "Buy the top-10 by trailing 12-month return, rebalance monthly.", "monthly"),
    ("mean_reversion", "Mean Reversion", "Buy yesterday's 10 biggest losers, hold 1 day.", "daily"),
    (
        "low_vol",
        "Low Volatility",
        f"Buy the {TOP_N} lowest trailing-{LOW_VOL_LOOKBACK_DAYS}-day-volatility names, rebalance monthly.",
        "monthly",
    ),
    ("buy_hold", "Buy & Hold", "Equal-weight all tickers, held for the full period (benchmark).", "once"),
]


def run_strategy(key, prices, returns, top_n, cost_bps=COST_BPS):
    if key == "momentum_1d":
        return momentum_1day(returns, top_n, cost_bps)
    if key == "mean_reversion":
        return mean_reversion(returns, top_n, cost_bps)
    if key == "momentum_12m":
        return momentum_12month(prices, returns, top_n, MOMENTUM_LOOKBACK_DAYS, cost_bps)
    if key == "low_vol":
        return low_volatility(
            returns, top_n, LOW_VOL_LOOKBACK_DAYS, cost_bps, LOW_VOL_MIN_COVERAGE_FRACTION
        )
    if key == "buy_hold":
        return buy_and_hold(returns, cost_bps)
    raise ValueError(f"Unknown strategy: {key}")


def _compact(value):
    """int when the value is whole, float otherwise -- shortens the JSON
    without changing any number."""
    return int(value) if value == int(value) else value


def annualized_turnover(daily_turnover, dates):
    """Portfolio turnover per year: total fraction traded over the window,
    divided by the window's length in years. 1.0 means the portfolio is
    replaced about once a year on average."""
    total = float(daily_turnover.fillna(0.0).sum())
    years = (dates[-1] - dates[0]).days / 365.25
    return total / years if years > 0 else None


def print_comparison_table(strategies_raw, dates):
    """Console-only sanity check, computed via engine.py's full-window
    summary helpers. The frontend independently recomputes the same
    quantities from daily_returns for whatever start date is selected."""
    print(f"\nStrategy Comparison (net of a {COST_BPS:.0f} bps/trade cost assumption)")
    print(f"{'Strategy':<20}{'Up-Rate':>10}{'Avg Return':>14}{'Total Return':>16}{'Final Value':>16}{'Turnover/yr':>14}")
    print("-" * 90)
    for key, label, _, _ in STRATEGY_ORDER:
        raw = strategies_raw[key]
        equity = build_equity_curve(dates, raw["daily_portfolio_return"], INITIAL_CAPITAL)
        metrics = summarize_period_returns(raw["period_returns"])
        total_return = total_return_from_equity(equity)
        final_value = float(equity.iloc[-1]) if len(equity) else INITIAL_CAPITAL
        turnover = annualized_turnover(raw["daily_turnover"], dates)

        up_rate = f"{metrics['up_rate']:.2%}" if metrics["up_rate"] is not None else "n/a"
        avg_return = f"{metrics['avg_return']:.4%}" if metrics["avg_return"] is not None else "n/a"
        turnover_str = f"{turnover:.1f}x" if turnover is not None else "n/a"
        print(f"{label:<20}{up_rate:>10}{avg_return:>14}{total_return:>15.2%} {final_value:>14,.2f}{turnover_str:>14}")


def _verify_cost_linearity(prices, returns, strategies_raw, probe_bps=100.0):
    """Re-run every strategy at a DIFFERENT cost level and confirm the stored
    (net return, turnover) pair reproduces it exactly.

    The Strategies tab's cost-sensitivity panel and break-even solver both
    rest on `net(bps) = net(base) + turnover * (base - bps) / 10_000`. That
    holds only because no selection rule reads cost_bps, so turnover is
    invariant to it. Rather than assert that in a comment, this re-derives it
    against a genuine re-run on every refresh -- if someone later makes a
    strategy cost-aware, the nightly job fails here instead of the site
    quietly showing wrong break-even numbers.
    """
    worst = 0.0
    for key, _, _, _ in STRATEGY_ORDER:
        base = strategies_raw[key]
        probe = run_strategy(key, prices, returns, TOP_N, cost_bps=probe_bps)

        base_turnover = base["daily_turnover"].fillna(-1.0)
        probe_turnover = probe["daily_turnover"].fillna(-1.0)
        if not base_turnover.equals(probe_turnover):
            raise AssertionError(
                f"{key}: turnover changed when cost_bps changed, so its selection rule now "
                "depends on cost. The frontend's linear cost re-pricing is no longer valid."
            )

        reconstructed = base["daily_portfolio_return"] + base["daily_turnover"] * (
            (COST_BPS - probe_bps) / 10_000
        )
        error = (reconstructed - probe["daily_portfolio_return"]).abs().max()
        error = 0.0 if pd.isna(error) else float(error)
        worst = max(worst, error)

    if worst > 1e-12:
        raise AssertionError(
            f"Cost linearity broken: reconstructing returns at {probe_bps:.0f} bps from the "
            f"exported turnover differs from a real re-run by up to {worst:.2e}."
        )
    print(f"\nCost-linearity self-check: exported turnover reproduces a genuine "
          f"{probe_bps:.0f} bps re-run of all {len(STRATEGY_ORDER)} strategies "
          f"(max error {worst:.1e}).")


def summarize_low_vol_holdings(baskets_by_month, top_n=8):
    """Which names the Low-Volatility screen actually keeps picking.

    Computed from the real rebalance history rather than asserted, so the
    page can name the concentration instead of only warning about it in the
    abstract. Full-window by construction (it describes the strategy's
    character, not a windowed metric), and labelled that way on the page."""
    counts = {}
    for basket in baskets_by_month.values():
        for ticker in basket:
            counts[ticker] = counts.get(ticker, 0) + 1
    total = len(baskets_by_month)
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top_n]
    return {
        "rebalances": total,
        "holdings": [
            {
                "ticker": ticker,
                "name": get_name(ticker),
                "months_held": held,
                "fraction": round(held / total, 4) if total else 0.0,
            }
            for ticker, held in ranked
        ],
    }


def main():
    prices, returns, _benchmark_returns, _index_benchmark_returns = load_universe()
    valid_tickers = list(prices.columns)
    print(f"Got data for {len(valid_tickers)} tickers, {len(prices)} trading days.")

    dates = returns.index

    print(f"Running {len(STRATEGY_ORDER)} strategies (no look-ahead: each selection uses "
          "only data known as of its own date; outcomes are always scored forward)...")

    strategies_raw = {}
    strategies_out = {}
    for key, label, description, rebalance in STRATEGY_ORDER:
        raw = run_strategy(key, prices, returns, TOP_N)
        strategies_raw[key] = raw
        daily_return = raw["daily_portfolio_return"]
        daily_turnover = raw["daily_turnover"]
        strategies_out[key] = {
            "id": key,
            "label": label,
            "description": description,
            "rebalance": rebalance,
            "daily_returns": [
                None if pd.isna(value) else round(float(value), 6)
                for value in daily_return
            ],
            # Same length and null pattern as daily_returns: a day the
            # strategy isn't trading in has no turnover to report, and
            # pairing them 1:1 is what makes the frontend's re-pricing a
            # straight element-wise operation.
            #
            # Emitted as an int when it is a whole number ("2" not "2.0").
            # Turnover is always a multiple of 1/TOP_N so this is lossless,
            # and ~64% of entries are integral -- worth a few KB on a page
            # that already ships five daily series to the browser.
            "daily_turnover": [
                None if pd.isna(value) else _compact(round(float(turnover), 4))
                for value, turnover in zip(daily_return, daily_turnover.fillna(0.0))
            ],
        }

    _verify_cost_linearity(prices, returns, strategies_raw)
    low_vol_holdings = summarize_low_vol_holdings(strategies_raw["low_vol"]["baskets_by_month"])

    output = {
        "meta": {
            "tickers_used": valid_tickers,
            "num_tickers": len(valid_tickers),
            "period": PERIOD,
            "top_n": TOP_N,
            "momentum_lookback_days": MOMENTUM_LOOKBACK_DAYS,
            "low_vol_lookback_days": LOW_VOL_LOOKBACK_DAYS,
            "low_vol_min_coverage_fraction": LOW_VOL_MIN_COVERAGE_FRACTION,
            "low_vol_holdings": low_vol_holdings,
            "initial_capital": INITIAL_CAPITAL,
            "cost_bps": COST_BPS,
            "cost_note": (
                f"Assumes {COST_BPS:.0f} bps per trade (one-way), charged on each "
                "strategy's actual turnover. Real-world slippage -- typically "
                "wider on less liquid names -- would add to this and isn't "
                "separately modeled."
            ),
            "turnover_note": (
                "daily_turnover is the fraction of portfolio value traded that day. "
                f"The cost already deducted from that day's return is turnover x {COST_BPS:.0f}/10000. "
                "Because no strategy's selection rule reads the cost assumption, turnover is "
                "invariant to it, so any other cost level can be priced exactly as "
                "return + turnover x (cost_bps - new_bps) / 10000."
            ),
            "dates": [d.strftime("%Y-%m-%d") for d in dates],
            "date_range": {
                "start": dates[0].strftime("%Y-%m-%d"),
                "end": dates[-1].strftime("%Y-%m-%d"),
            },
            "strategy_order": [key for key, _, _, _ in STRATEGY_ORDER],
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
