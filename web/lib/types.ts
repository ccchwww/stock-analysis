export type EquityPoint = {
  date: string;
  value: number;
};

export type StrategyResult = {
  id: string;
  label: string;
  description: string;
  // Aligned by position to ResultsMeta.dates; null where the strategy has no
  // trade that day (e.g. still in its warm-up period). Every displayed stat
  // and chart curve is derived from this client-side for whatever start date
  // is selected -- see lib/strategy-stats.ts.
  daily_returns: (number | null)[];
};

export type ResultsMeta = {
  tickers_used: string[];
  num_tickers: number;
  period: string;
  top_n: number;
  momentum_lookback_days: number;
  initial_capital: number;
  cost_bps: number;
  cost_note: string;
  dates: string[];
  date_range: { start: string; end: string };
  strategy_order: string[];
};

export type ResultsData = {
  meta: ResultsMeta;
  strategies: Record<string, StrategyResult>;
};
