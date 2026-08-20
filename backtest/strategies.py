"""Four comparable strategies over the same tickers/date range.

Every strategy function returns a dict with:
  - daily_portfolio_return: a pd.Series (indexed by date) of the return the
    strategy's portfolio earned on that date, NET of transaction costs. This
    is what engine.py compounds into an equity curve, so it must never peek
    at information from a date later than the one it's assigned to.
  - period_returns: a pd.Series used for up-rate / average-return stats, on
    whatever cadence the strategy naturally trades (daily, or monthly for the
    12-month momentum strategy).

Look-ahead-bias rule followed throughout: a selection made "as of" a given
date/close may only use returns/prices known at or before that date. The
return realized on any later date is purely an outcome, never an input.

Transaction costs (see costs.py) are charged on every rebalance based on the
strategy's ACTUAL turnover: a daily-rebalanced basket pays it every day, the
monthly one pays it once a month, and Buy & Hold pays it exactly once (the
initial buy-in).
"""

import pandas as pd

from costs import rebalance_cost


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
        cost = rebalance_cost(num_sold, num_bought, top_n, cost_bps)
        previous_basket = basket

        daily_portfolio_return.loc[day_n1] = gross_return - cost

    return daily_portfolio_return


def momentum_1day(returns, top_n, cost_bps):
    """Rank by yesterday's return, buy the top N, hold 1 day."""
    daily_portfolio_return = _rank_and_hold_one_day(returns, top_n, "best", cost_bps)
    return {
        "daily_portfolio_return": daily_portfolio_return,
        "period_returns": daily_portfolio_return.dropna(),
    }


def mean_reversion(returns, top_n, cost_bps):
    """Rank by yesterday's return, buy the biggest N losers, hold 1 day."""
    daily_portfolio_return = _rank_and_hold_one_day(returns, top_n, "worst", cost_bps)
    return {
        "daily_portfolio_return": daily_portfolio_return,
        "period_returns": daily_portfolio_return.dropna(),
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
    dates = returns.index
    trailing_return = prices / prices.shift(lookback_days) - 1

    daily_portfolio_return = pd.Series(index=dates, dtype=float)
    months = dates.to_period("M")
    previous_basket = None

    for month in months.unique():
        month_dates = dates[months == month]
        first_day = month_dates[0]
        first_pos = dates.get_loc(first_day)
        if first_pos == 0:
            continue  # no prior trading day to select a basket from

        prior_day = dates[first_pos - 1]
        trailing_scores = trailing_return.loc[prior_day].dropna()
        if len(trailing_scores) < top_n:
            continue  # not enough trailing history yet (still in warm-up)

        basket_index = trailing_scores.sort_values(ascending=False).head(top_n).index
        basket = set(basket_index)

        if previous_basket is None:
            num_sold, num_bought = 0, top_n
        else:
            num_sold = len(previous_basket - basket)
            num_bought = len(basket - previous_basket)
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
                cost_charged = True
            daily_portfolio_return.loc[day] = day_return

    daily_clean = daily_portfolio_return.dropna()
    # Compound the daily series within each month to get monthly period returns.
    monthly_returns = (1 + daily_clean).groupby(daily_clean.index.to_period("M")).prod() - 1

    return {
        "daily_portfolio_return": daily_portfolio_return,
        "period_returns": monthly_returns,
    }


def buy_and_hold(returns, cost_bps):
    """Equal-weight all tickers in the universe, held for the whole period --
    the passive benchmark every active strategy is measured against. Trades
    exactly once (the initial buy-in); that entry cost is charged against the
    first day's return, since there's never a subsequent sale within the
    window."""
    daily_portfolio_return = returns.mean(axis=1, skipna=True)

    valid = daily_portfolio_return.dropna()
    if not valid.empty:
        first_date = valid.index[0]
        entry_cost = cost_bps / 10_000  # one-way buy-in, no offsetting sell leg
        daily_portfolio_return.loc[first_date] -= entry_cost

    return {
        "daily_portfolio_return": daily_portfolio_return,
        "period_returns": daily_portfolio_return.dropna(),
    }
