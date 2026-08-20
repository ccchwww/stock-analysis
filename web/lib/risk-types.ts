// risk.json now holds only the Risk Dashboard's ASSUMPTIONS/config -- actual
// per-stock daily returns live in market_data.json (shared with the
// Strategies tab, see lib/market-data-types.ts).
export type RiskMeta = {
  trading_days_per_year: number;
  risk_free_rate_annual: number;
  risk_free_rate_note: string;
  var_confidence: number;
  var_method: string;
};

export type RiskData = {
  meta: RiskMeta;
};
