"""Turns a strategy's daily portfolio-return series into comparable metrics:
an equity curve ($10k growth), a total cumulative return, and up-rate/avg-return
stats over whatever period the strategy naturally rebalances on.

Every strategy hands back a daily return series, so this module is the single
place that defines "how do we score a strategy" -- keeping the five strategies
directly comparable instead of each computing its own metrics ad hoc.
"""

import pandas as pd


def build_equity_curve(all_dates, daily_portfolio_return, initial_capital):
    """Compound a daily return series into a $-value equity curve.

    The curve starts at `initial_capital` on the trading day BEFORE the
    strategy's first valid return (that first return is realized ON its
    date, so the point before it must still show the untouched starting
    capital). Any missing return inside the strategy's active window is
    treated as a flat (0%) day rather than dropped, so the curve stays
    continuous.
    """
    valid = daily_portfolio_return.dropna()
    if valid.empty:
        return pd.Series(dtype=float)

    first_return_date = valid.index[0]
    first_pos = all_dates.get_loc(first_return_date)
    anchor_date = all_dates[first_pos - 1] if first_pos > 0 else first_return_date

    window = daily_portfolio_return.loc[first_return_date:].fillna(0.0)
    compounded = (1 + window).cumprod() * initial_capital

    anchor_point = pd.Series([initial_capital], index=[anchor_date])
    return pd.concat([anchor_point, compounded])


def sample_equity_curve(equity, step):
    """Downsample to ~every `step`-th trading day so the JSON output stays
    small, always keeping the first and last point."""
    if equity.empty:
        return []

    sampled = equity.iloc[::step]
    if equity.index[-1] not in sampled.index:
        sampled = pd.concat([sampled, equity.iloc[[-1]]])

    return [
        {"date": date.strftime("%Y-%m-%d"), "value": round(float(value), 2)}
        for date, value in sampled.items()
    ]


def summarize_period_returns(period_returns):
    """Up-rate and average return over whatever period the strategy trades on
    (daily for the daily-rebalanced strategies, monthly for 12-month momentum)."""
    clean = period_returns.dropna()
    if clean.empty:
        return {"up_rate": None, "avg_return": None, "num_periods": 0}
    return {
        "up_rate": round(float((clean > 0).mean()), 4),
        "avg_return": round(float(clean.mean()), 6),
        "num_periods": int(len(clean)),
    }


def total_return_from_equity(equity):
    """Whole-period compounded return, independent of rebalance frequency --
    this is what makes strategies with different trading cadences comparable."""
    if len(equity) < 2:
        return 0.0
    return round(float(equity.iloc[-1] / equity.iloc[0] - 1), 6)
