"""Five comparable strategies over the same tickers/date range.

Every strategy function returns a dict with:
  - daily_portfolio_return: a pd.Series (indexed by date) of the return the
    strategy's portfolio earned on that date, NET of transaction costs. This
    is what engine.py compounds into an equity curve, so it must never peek
    at information from a date later than the one it's assigned to.
  - daily_turnover: a pd.Series, same index, of the fraction of portfolio
    value TRADED on that date (0.0 on a day with no rebalance). The cost
    already deducted from that day's return is exactly
    `daily_turnover * cost_bps / 10_000`, which is what lets the frontend
    re-price any strategy at any cost level -- see costs.py's
    turnover_fraction for why that identity holds exactly.
  - period_returns: a pd.Series used for up-rate / average-return stats, on
    whatever cadence the strategy naturally trades (daily, or monthly for the
    two monthly-rebalanced strategies).

Look-ahead-bias rule followed throughout: a selection made "as of" a given
date/close may only use returns/prices known at or before that date. The
return realized on any later date is purely an outcome, never an input.

Transaction costs (see costs.py) are charged on every rebalance based on the
strategy's ACTUAL turnover: a daily-rebalanced basket pays it every day, the
monthly ones pay it once a month, and Buy & Hold pays it exactly once (the
initial buy-in).
"""

import pandas as pd

from costs import rebalance_cost, turnover_fraction


def _rank_and_hold_one_day(returns, top_n, pick, cost_bps):
    """Shared engine for the two 1-day-holding strategies: rank all stocks by
    day N's return, select a basket (best or worst `top_n`), and score them
    on day N+1's return. Selection uses only day N data; day N+1 is the
    outcome, never fed back into the ranking.

    Because the basket is re-picked from scratch every day, most of it turns
    over day to day -- the cost of that turnover is charged against day N+1's
    return before it's recorded.
    """
    dates = returns.index
    daily_portfolio_return = pd.Series(index=dates, dtype=float)
    daily_turnover = pd.Series(index=dates, dtype=float)
    previous_basket = None

    for i in range(1, len(dates) - 1):
        day_n = dates[i]
        day_n1 = dates[i + 1]

        today_returns = returns.loc[day_n].dropna()
        if len(today_returns) < top_n:
            continue

        ranked = today_returns.sort_values(ascending=(pick == "worst"))
        picks = ranked.head(top_n)
        basket = set(picks.index)

        next_day_all = returns.loc[day_n1]
        next_for_picks = next_day_all.reindex(picks.index).dropna()
        if next_for_picks.empty:
            continue

        gross_return = next_for_picks.mean()

        if previous_basket is None:
            # First-ever rebalance: buying the whole basket from cash, nothing to sell yet.
            num_sold, num_bought = 0, top_n
        else:
            num_sold = len(previous_basket - basket)
            num_bought = len(basket - previous_basket)
        turnover = turnover_fraction(num_sold, num_bought, top_n)
        cost = rebalance_cost(num_sold, num_bought, top_n, cost_bps)
        previous_basket = basket

        daily_portfolio_return.loc[day_n1] = gross_return - cost
        daily_turnover.loc[day_n1] = turnover

    return daily_portfolio_return, daily_turnover


def momentum_1day(returns, top_n, cost_bps):
    """Rank by yesterday's return, buy the top N, hold 1 day."""
    daily_portfolio_return, daily_turnover = _rank_and_hold_one_day(
        returns, top_n, "best", cost_bps
    )
    return {
        "daily_portfolio_return": daily_portfolio_return,
        "daily_turnover": daily_turnover,
        "period_returns": daily_portfolio_return.dropna(),
    }


def mean_reversion(returns, top_n, cost_bps):
    """Rank by yesterday's return, buy the biggest N losers, hold 1 day."""
    daily_portfolio_return, daily_turnover = _rank_and_hold_one_day(
        returns, top_n, "worst", cost_bps
    )
    return {
        "daily_portfolio_return": daily_portfolio_return,
        "daily_turnover": daily_turnover,
        "period_returns": daily_portfolio_return.dropna(),
    }


def _monthly_rank_and_hold(returns, top_n, cost_bps, select_basket):
    """Shared engine for the two MONTHLY-rebalanced strategies (12-Month
    Momentum and Low Volatility), so they are guaranteed to use the same
    rebalance frequency, the same cost model, and -- most importantly -- the
    same look-ahead rule, rather than each re-deriving them.

    Rebalance cadence: on the FIRST trading day of each calendar month. The
    basket is chosen by `select_basket(prior_day, first_pos)`, where
    `prior_day` is the last trading day of the PREVIOUS month and `first_pos`
    is that month's first-day position in `dates`. The callback may only look
    at data up to and including `prior_day` -- i.e. positions strictly below
    `first_pos`. It returns a pandas Index of tickers, or None if it cannot
    make a selection yet (still in warm-up).

    The chosen basket is then held unchanged (equal-weighted, daily return)
    for every trading day of that month. Turnover, and its cost, is paid once
    per month, on the first day the new basket actually trades.
    """
    dates = returns.index
    daily_portfolio_return = pd.Series(index=dates, dtype=float)
    daily_turnover = pd.Series(index=dates, dtype=float)
    months = dates.to_period("M")
    previous_basket = None
    baskets_by_month = {}

    for month in months.unique():
        month_dates = dates[months == month]
        first_day = month_dates[0]
        first_pos = dates.get_loc(first_day)
        if first_pos == 0:
            continue  # no prior trading day to select a basket from

        prior_day = dates[first_pos - 1]
        basket_index = select_basket(prior_day, first_pos)
        if basket_index is None:
            continue  # not enough history yet (still in warm-up)

        # Belt-and-braces look-ahead guard, checked on every rebalance of
        # every run rather than trusted to the callbacks: the day a basket
        # starts trading must be strictly later than the last day that could
        # have informed the choice.
        if not (prior_day < first_day):
            raise AssertionError(
                f"Look-ahead violation: basket for {first_day.date()} was selected "
                f"using data through {prior_day.date()}, which is not strictly earlier."
            )

        basket = set(basket_index)
        baskets_by_month[first_day] = list(basket_index)

        if previous_basket is None:
            num_sold, num_bought = 0, top_n
        else:
            num_sold = len(previous_basket - basket)
            num_bought = len(basket - previous_basket)
        turnover = turnover_fraction(num_sold, num_bought, top_n)
        cost = rebalance_cost(num_sold, num_bought, top_n, cost_bps)
        previous_basket = basket

        cost_charged = False
        for day in month_dates:
            day_returns = returns.loc[day, basket_index].dropna()
            if day_returns.empty:
                continue
            day_return = day_returns.mean()
            if not cost_charged:
                day_return -= cost
                daily_turnover.loc[day] = turnover
                cost_charged = True
            else:
                daily_turnover.loc[day] = 0.0
            daily_portfolio_return.loc[day] = day_return

    daily_clean = daily_portfolio_return.dropna()
    # Compound the daily series within each month to get monthly period returns.
    monthly_returns = (1 + daily_clean).groupby(daily_clean.index.to_period("M")).prod() - 1

    return {
        "daily_portfolio_return": daily_portfolio_return,
        "daily_turnover": daily_turnover,
        "period_returns": monthly_returns,
        "baskets_by_month": baskets_by_month,
    }


def momentum_12month(prices, returns, top_n, lookback_days, cost_bps):
    """Rank by trailing ~12-month return, buy the top N, rebalance monthly.

    The basket for a given month is selected using the trailing return as of
    the close of the LAST trading day of the PREVIOUS month -- entirely past
    information relative to the month it's traded in -- then held unchanged
    (with daily equal-weight return) for every trading day of that month.
    Turnover, and its cost, is only paid once per month, on the first trading
    day the new basket actually trades.
    """
    trailing_return = prices / prices.shift(lookback_days) - 1

    def select(prior_day, _first_pos):
        # .loc[prior_day] reads the trailing return AS OF the previous
        # month's close -- the newest observation this row can contain is
        # prior_day's own price, never anything from the month being traded.
        trailing_scores = trailing_return.loc[prior_day].dropna()
        if len(trailing_scores) < top_n:
            return None
        return trailing_scores.sort_values(ascending=False).head(top_n).index

    result = _monthly_rank_and_hold(returns, top_n, cost_bps, select)
    result.pop("baskets_by_month", None)
    return result


def low_volatility(returns, top_n, lookback_days, cost_bps, min_coverage_fraction):
    """Hold the `top_n` LOWEST trailing-volatility names, rebalanced monthly.

    The low-volatility anomaly: portfolios of low-volatility stocks have
    historically delivered better risk-adjusted returns than CAPM predicts,
    and sometimes better absolute returns too -- the opposite of the
    risk-return trade-off theory assumes. This implements the plain version
    of that idea: rank on realized volatility, hold the calmest names,
    equal-weighted.

    Same rebalance frequency (first trading day of each month) and the same
    turnover-based cost model as 12-Month Momentum -- both go through
    _monthly_rank_and_hold above, so the two are directly comparable and
    neither can drift from the shared look-ahead rule.

    NO LOOK-AHEAD: the ranking window is sliced by POSITION as
    `returns.iloc[first_pos - lookback_days : first_pos]`. Python's
    half-open slicing makes `first_pos` exclusive, so the last row in the
    window is `first_pos - 1` -- the previous month's final trading day. The
    rebalance date's own return is not in the window, and neither is any
    later date. The assertion below re-checks that from the window's actual
    index rather than trusting the arithmetic, and _monthly_rank_and_hold
    independently re-checks it again for every rebalance.
    """
    dates = returns.index
    min_observations = int(lookback_days * min_coverage_fraction)

    def select(_prior_day, first_pos):
        if first_pos < lookback_days:
            return None  # not a full trailing window yet

        # --- the look-ahead-critical line ---
        window = returns.iloc[first_pos - lookback_days : first_pos]

        rebalance_date = dates[first_pos]
        if not (window.index[-1] < rebalance_date):
            raise AssertionError(
                f"Look-ahead violation: the {lookback_days}-day volatility window for "
                f"{rebalance_date.date()} ends at {window.index[-1].date()}, which is not "
                f"strictly before the rebalance date."
            )

        # A ticker needs enough real observations for its standard deviation
        # to mean anything -- otherwise a name with a handful of quiet days
        # wins a slot on missing data rather than on genuinely low risk.
        counts = window.count()
        eligible = counts[counts >= min_observations].index
        if len(eligible) < top_n:
            return None

        volatility = window[eligible].std().dropna()
        if len(volatility) < top_n:
            return None
        return volatility.sort_values(ascending=True).head(top_n).index

    return _monthly_rank_and_hold(returns, top_n, cost_bps, select)


def buy_and_hold(returns, cost_bps):
    """Equal-weight all tickers in the universe, held for the whole period --
    the passive benchmark every active strategy is measured against. Trades
    exactly once (the initial buy-in); that entry cost is charged against the
    first day's return, since there's never a subsequent sale within the
    window."""
    daily_portfolio_return = returns.mean(axis=1, skipna=True)
    daily_turnover = pd.Series(0.0, index=returns.index)

    valid = daily_portfolio_return.dropna()
    if not valid.empty:
        first_date = valid.index[0]
        entry_cost = cost_bps / 10_000  # one-way buy-in, no offsetting sell leg
        daily_portfolio_return.loc[first_date] -= entry_cost
        daily_turnover.loc[first_date] = 1.0  # bought the whole portfolio once

    return {
        "daily_portfolio_return": daily_portfolio_return,
        "daily_turnover": daily_turnover,
        "period_returns": daily_portfolio_return.dropna(),
    }
