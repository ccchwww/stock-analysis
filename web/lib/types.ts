export type EquityPoint = {
  date: string;
  value: number;
};

export type StrategyResult = {
  id: string;
  label: string;
  description: string;
  /** How often this strategy actually trades, from backtest/momentum_backtest.py's
   * STRATEGY_ORDER: "daily", "monthly", or "once" (Buy & Hold's initial buy-in). */
  rebalance: string;
  // Aligned by position to ResultsMeta.dates; null where the strategy has no
  // trade that day (e.g. still in its warm-up period). Every displayed stat
  // and chart curve is derived from this client-side for whatever start date
  // is selected -- see lib/strategy-stats.ts.
  daily_returns: (number | null)[];
  // Fraction of portfolio value traded that day, same length and null pattern
  // as daily_returns. The cost already deducted from daily_returns[i] is
  // exactly daily_turnover[i] * cost_bps / 10_000, which is what lets
  // lib/cost-model.ts re-price any strategy at any cost level without a
  // second backtest. See ResultsMeta.turnover_note and backtest/costs.py.
  daily_turnover: (number | null)[];
};

/** Which names the Low-Volatility screen keeps selecting, computed in
 * backtest/momentum_backtest.py from the real rebalance history over the FULL
 * window (it describes the strategy's character, not a windowed metric). */
export type LowVolHoldings = {
  rebalances: number;
  holdings: Array<{
    ticker: string;
    name: string;
    months_held: number;
    fraction: number;
  }>;
};

export type ResultsMeta = {
  tickers_used: string[];
  num_tickers: number;
  period: string;
  top_n: number;
  momentum_lookback_days: number;
  low_vol_lookback_days: number;
  low_vol_min_coverage_fraction: number;
  low_vol_holdings: LowVolHoldings;
  initial_capital: number;
  cost_bps: number;
  cost_note: string;
  turnover_note: string;
  dates: string[];
  date_range: { start: string; end: string };
  strategy_order: string[];
};

export type ResultsData = {
  meta: ResultsMeta;
  strategies: Record<string, StrategyResult>;
};
