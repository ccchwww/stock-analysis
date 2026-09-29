"""Transaction-cost model shared by every strategy.

Cost is charged in basis points per trade (one-way): replacing a position in
an equal-weighted basket costs COST_BPS on the sell leg and COST_BPS on the
buy leg. This is a simplification -- real trading also incurs slippage
(wider for less liquid names), which isn't modeled separately here. Treat
COST_BPS as a conservative floor for large, liquid names, not a full
cost estimate.
"""


def turnover_fraction(num_sold, num_bought, basket_size):
    """Fraction of portfolio value traded when `num_sold` positions are
    exited and `num_bought` new ones entered, out of an equal-weighted basket
    of `basket_size` names. A full round-trip on one position (sold and
    replaced) counts as one sell + one buy, i.e. 2/basket_size.

    Split out from rebalance_cost so the backtest can EXPORT turnover
    alongside each net return. Cost enters a strategy's return purely as
    `turnover * bps/10_000`, and turnover itself never depends on the cost
    assumption (no strategy's selection rule reads cost_bps -- they rank on
    returns, trailing returns, or volatility). That makes net return an exact
    linear function of the cost level, which is what lets the Strategies tab
    re-price any strategy at any bps client-side from one stored series
    instead of shipping five pre-computed cost scenarios. momentum_backtest.py
    verifies that identity against a genuine re-run on every refresh.
    """
    if basket_size == 0:
        return 0.0
    return (num_sold + num_bought) / basket_size


def rebalance_cost(num_sold, num_bought, basket_size, cost_bps):
    """Fraction of portfolio value lost to trading on one rebalance."""
    return turnover_fraction(num_sold, num_bought, basket_size) * (cost_bps / 10_000)
