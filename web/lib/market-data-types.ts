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

// The CAPM market benchmark (backtest/config.py's BENCHMARK_TICKER),
// inner-joined onto the same dates as every stock (see
// backtest/market_data.py) so Beta/Alpha always have paired (stock, market)
// observations to work from. Same shape as StockReturns so it slices by start
// date through the identical code path.
//
// It is a CAD-listed ETF rather than a raw index on purpose: index levels
// exclude dividends while our stock returns include them, and that mismatch
// used to leak the index's entire dividend yield into alpha. config.py has
// the full reasoning.
export type BenchmarkReturns = {
  ticker: string;
  name: string;
  returns: (number | null)[];
};

// Passive index benchmarks for the Strategies tab -- what a buy-and-forget
// investor could actually have owned, as opposed to the equal-weight Buy &
// Hold of this specific 51-name universe. CAD-listed total-return ETFs, keyed
// by config.py's INDEX_BENCHMARKS key, and aligned to the same dates array as
// every other series here.
export type IndexBenchmark = {
  key: string;
  ticker: string;
  label: string;
  description: string;
  returns: (number | null)[];
};

export type MarketData = {
  meta: MarketDataMeta;
  stocks: Record<string, StockReturns>;
  benchmark: BenchmarkReturns;
  index_benchmarks: Record<string, IndexBenchmark>;
};
