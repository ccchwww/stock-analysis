// stress_data.json is the long-history (2005-2022) dataset for the Model
// Validation tab's stress-testing section -- same shape as market_data.json
// (see market-data-types.ts) but a FIXED historical range independent of
// "today", and without a "period" field (there's no rolling window here).
export type StressDataMeta = {
  tickers_used: string[];
  num_tickers: number;
  dates: string[];
  date_range: { start: string; end: string };
};

export type StressStockReturns = {
  ticker: string;
  name: string;
  returns: (number | null)[];
};

export type StressBenchmarkReturns = {
  ticker: string;
  name: string;
  returns: (number | null)[];
};

export type StressData = {
  meta: StressDataMeta;
  stocks: Record<string, StressStockReturns>;
  benchmark: StressBenchmarkReturns;
};
