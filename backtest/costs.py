"""Transaction-cost model shared by every strategy.

Cost is charged in basis points per trade (one-way): replacing a position in
an equal-weighted basket costs COST_BPS on the sell leg and COST_BPS on the
buy leg. This is a simplification -- real trading also incurs slippage
(wider for less liquid names), which isn't modeled separately here. Treat
COST_BPS as a conservative floor for large, liquid names, not a full
cost estimate.
"""


def rebalance_cost(num_sold, num_bought, basket_size, cost_bps):
    """Fraction of portfolio value lost to trading when `num_sold` positions
    are exited and `num_bought` new ones entered, out of an equal-weighted
    basket of `basket_size` names. A full round-trip on one position (sold
    and replaced) counts as one sell + one buy, i.e. 2/basket_size of
    turnover."""
    if basket_size == 0:
        return 0.0
    turnover = (num_sold + num_bought) / basket_size
    return turnover * (cost_bps / 10_000)
