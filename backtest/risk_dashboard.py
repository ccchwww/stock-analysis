"""
Risk Dashboard configuration export.

Per-stock daily returns now live in market_data.json (shared with the
strategy backtest) -- this script's only remaining job is to serialize the
risk-analysis ASSUMPTIONS (risk-free rate, VaR method/confidence, the
annualization convention) to web/public/risk.json, so they're a single
configurable, documented source instead of being duplicated or silently
hardcoded in the frontend. All actual metric computation (volatility,
Sharpe, drawdown, VaR, correlation, Monte Carlo) happens client-side in
web/lib/, driven by market_data.json's daily returns -- kept self-contained
here so this risk-analysis path doesn't entangle with the strategy-backtest
code.
"""

import json
from pathlib import Path

from config import RISK_FREE_RATE_ANNUAL, VAR_CONFIDENCE

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OUTPUT_PATH = REPO_ROOT / "web" / "public" / "risk.json"

TRADING_DAYS_PER_YEAR = 252


def main():
    output = {
        "meta": {
            "trading_days_per_year": TRADING_DAYS_PER_YEAR,
            "risk_free_rate_annual": RISK_FREE_RATE_ANNUAL,
            "risk_free_rate_note": (
                "Approximate Government of Canada 3-month T-bill annual yield, "
                "set manually as an illustrative constant (backtest/config.py), "
                "not a live feed -- check bankofcanada.ca/rates/interest-rates "
                "for the current value."
            ),
            "var_confidence": VAR_CONFIDENCE,
            "var_method": (
                "Historical (empirical percentile of actual daily returns), "
                "1-day horizon. Says nothing about how severe losses beyond "
                "the threshold could be -- Expected Shortfall (a.k.a. "
                "Conditional VaR), shown alongside VaR everywhere it appears "
                "below, is the companion metric that covers exactly that: "
                "the average loss on the worst days, not just where the "
                "worst days begin."
            ),
        },
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Wrote risk config to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
