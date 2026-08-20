// validation.json holds only the Model Validation tab's ASSUMPTIONS/config --
// same pattern as risk.json. The actual computation (VaR backtest, stress
// testing) is computed client-side, driven by market_data.json's /
// stress_data.json's daily returns.
export type ValidationMeta = {
  var_window_days: number;
  confidence_levels: number[];
  z_scores: Record<string, number>;
  chi2_critical_95: { df1: number; df2: number };
  basel_zones: Array<{ zone: string; max_exceptions: number | null }>;
  methodology_note: string;
  warmup_note: string;
  basel_note: string;
  fat_tail_note: string;
};

export type StressWindowConfig = {
  key: string;
  label: string;
  start: string;
  end: string;
  lookback_start: string;
};

export type StressMeta = {
  windows: StressWindowConfig[];
  lookback_years: number;
  min_coverage_fraction: number;
  fixed_window_note: string;
  lookahead_note: string;
  survivorship_note: string;
  correlation_baseline_note: string;
};

export type ValidationData = {
  meta: ValidationMeta;
  stress: StressMeta;
};
