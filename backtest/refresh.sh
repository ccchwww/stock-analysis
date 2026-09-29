#!/usr/bin/env bash
#
# Regenerate the daily JSON artefacts in web/public/.
#
# Runs with backtest/ as the working directory because every script does a
# bare `from config import ...` -- they are modules of this directory, not an
# installed package, so Python has to find them on sys.path via the cwd.
#
# Dependency order matters:
#   1. market_data.py      downloads the TSX 60 + ^GSPTSE benchmark from
#                          yfinance, writes market_data.json.
#   2. momentum_backtest.py imports load_universe() from market_data, so it
#                          hits yfinance again on its own; writes results.json.
#   3. risk_dashboard.py   pure config serialization, no network; writes
#                          risk.json. Cheap, kept in the run so the published
#                          assumptions never drift from config.py.
#   4. validation.py       READS the already-written market_data.json and
#                          stress_data.json off disk (deliberately, so its
#                          scipy cross-check sees byte-identical data to the
#                          frontend) -- it must run last.
#
# stress_data.py is intentionally NOT run here: it covers four fixed
# historical crisis windows (2008 / 2014 / 2020 / 2022) with hardcoded
# start/end dates, so its output cannot change from one day to the next.
# Re-downloading ~20 years of history daily would only add failure surface.
# Run it by hand if STRESS_WINDOWS in config.py ever changes.

set -euo pipefail

cd "$(dirname "$0")"

PYTHON="${PYTHON:-python3}"

for script in market_data.py momentum_backtest.py risk_dashboard.py validation.py; do
  echo ""
  echo "=== $script ==="
  "$PYTHON" "$script"
done

echo ""
echo "=== refresh complete ==="
