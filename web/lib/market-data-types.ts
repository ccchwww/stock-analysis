// market_data.json is the canonical TSX 60 daily-returns dataset, shared by
// both the Strategies tab (stock selector, portfolio blending) and the Risk
// Dashboard (risk metrics, correlation, Monte Carlo, Beta/Alpha). One
// download/clean pipeline, one source of truth for the exact universe,
// trading calendar, and market benchmark.

export type MarketDataMeta = {
  tickers_used: string[];
  num_tickers: number;
  period: string;
  dates: string[];
  date_range: { start: string; end: string };
};

export type StockReturns = {
  ticker: string;
  name: string;
  // Aligned by position to MarketDataMeta.dates; null where this ticker has
  // no data that day.
  returns: (number | null)[];
};

// The S&P/TSX Composite Index, inner-joined onto the same dates as every
// stock (see backtest/market_data.py) so Beta/Alpha always have paired
// (stock, market) observations to work from. Same shape as StockReturns so
// it slices by start date through the identical code path.
export type BenchmarkReturns = {
  ticker: string;
  name: string;
  returns: (number | null)[];
};

export type MarketData = {
  meta: MarketDataMeta;
  stocks: Record<string, StockReturns>;
  benchmark: BenchmarkReturns;
};
