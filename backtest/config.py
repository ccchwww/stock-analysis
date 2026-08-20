"""Shared config so every strategy runs over identical data and is directly comparable."""

# S&P/TSX 60 constituents (Canadian large-caps). yfinance needs the ".TO"
# suffix for Toronto Stock Exchange tickers; share classes use a hyphen
# (e.g. "TECK-B.TO" for Teck Resources Class B).
#
# KNOWN LIMITATION: this is today's constituent list applied retroactively
# across the whole 5-year window, not the actual point-in-time membership at
# each past date. A fully rigorous backtest would use point-in-time index
# constituents, so names added to or dropped from the index mid-window are
# only "in the universe" for the dates they actually belonged to. As written,
# this list carries survivorship bias -- companies that left the TSX 60
# during the window (acquired, delisted, demoted) are excluded from the
# entire period rather than just the part after they left.
TICKERS = [
    "RY.TO", "TD.TO", "BNS.TO", "BMO.TO", "CM.TO", "NA.TO",
    "MFC.TO", "SLF.TO", "GWO.TO", "POW.TO", "IFC.TO", "FFH.TO",
    "BN.TO", "BAM.TO",
    "CNQ.TO", "SU.TO", "ENB.TO", "TRP.TO", "PPL.TO", "CVE.TO", "IMO.TO", "TOU.TO",
    "ABX.TO", "AEM.TO", "FNV.TO", "NTR.TO", "TECK-B.TO", "WPM.TO", "FM.TO",
    "CNR.TO", "CP.TO", "WCN.TO", "TRI.TO", "CTC-A.TO", "WSP.TO",
    "ATD.TO", "L.TO", "MRU.TO", "WN.TO", "QSR.TO", "DOL.TO",
    "FTS.TO", "EMA.TO",
    "BCE.TO", "T.TO", "RCI-B.TO",
    "SHOP.TO", "CSU.TO", "GIB-A.TO", "OTEX.TO", "CLS.TO",
    "CAR-UN.TO",
]

PERIOD = "5y"                    # yfinance lookback window
TOP_N = 10                       # basket size for the picking strategies
MOMENTUM_LOOKBACK_DAYS = 252     # ~12 trading months, for the 12-month momentum strategy
INITIAL_CAPITAL = 10_000.0       # starting portfolio value for equity curves
EQUITY_CURVE_SAMPLE_STEP = 5     # keep every 5th trading day (~weekly) in the output curve

# A ticker is dropped (rather than crashing the run) if it has valid closes
# for less than this fraction of the full window's trading days. This catches
# names that IPO'd/spun off partway through the window, were delisted early,
# or just have patchy data -- common enough among TSX constituents that this
# needs to be handled gracefully rather than assumed away.
MIN_HISTORY_FRACTION = 0.95

# Transaction cost assumption: basis points charged per trade (one-way), so a
# full round-trip (sell + buy) on one position costs 2x this. 10 bps/trade is
# a reasonable retail-ish baseline for large, liquid names. Real-world
# slippage -- typically much wider for smaller/less liquid names -- would add
# to this and isn't separately modeled; treat COST_BPS as a floor, not a
# complete cost estimate.
COST_BPS = 10.0

# --- Risk Dashboard constants ---

# Approximate annual yield on Government of Canada 3-month T-bills, used as
# the risk-free rate for Sharpe ratio calculations on the Risk Dashboard.
# This is a manually-set, illustrative value (reflecting roughly where BoC
# short-term rates have sat after cuts from the 2023 peak), NOT a live feed --
# check the Bank of Canada's current T-bill yields at
# bankofcanada.ca/rates/interest-rates and update this constant for a more
# current figure before treating Sharpe ratios as precise.
RISK_FREE_RATE_ANNUAL = 0.0275  # 2.75%

# Value-at-Risk confidence level used on the Risk Dashboard (0.95 -> "95% VaR",
# i.e. the loss threshold expected to be exceeded on 5% of trading days).
VAR_CONFIDENCE = 0.95

# Market benchmark for Beta/Alpha (CAPM) on the Risk Dashboard: the S&P/TSX
# Composite Index, the standard broad benchmark for the Canadian equity
# market. yfinance ticker for indices is prefixed with "^".
BENCHMARK_TICKER = "^GSPTSE"
BENCHMARK_NAME = "S&P/TSX Composite Index"

# --- Model Validation: Stress Testing (Part 2) ---

# Four historical crisis windows, FIXED dates -- independent of any
# start-date control elsewhere on the site. `lookback_start` is exactly 3
# calendar years before `start`: the window immediately prior used to
# estimate min-variance/max-Sharpe weights out-of-sample (see stress_data.py
# and web/lib/stress-test.ts), never the window itself or later.
STRESS_WINDOWS = [
    {
        "key": "gfc_2008",
        "label": "2008 Financial Crisis",
        "start": "2008-06-18",
        "end": "2009-03-09",
        "lookback_start": "2005-06-18",
    },
    {
        "key": "oil_crash",
        "label": "Oil Price Crash",
        "start": "2014-06-20",
        "end": "2016-01-20",
        "lookback_start": "2011-06-20",
    },
    {
        "key": "covid_crash",
        "label": "COVID-19 Crash",
        "start": "2020-02-19",
        "end": "2020-03-23",
        "lookback_start": "2017-02-19",
    },
    {
        "key": "rate_hikes_2022",
        "label": "2022 Rate-Hike Selloff",
        "start": "2022-01-04",
        "end": "2022-10-14",
        "lookback_start": "2019-01-04",
    },
]

STRESS_LOOKBACK_YEARS = 3

# Below this fraction of a window's (or lookback period's) trading days, a
# ticker is treated as not having usable data for that window -- applied
# both to "does this ticker qualify for the min-variance/max-Sharpe
# estimation universe" (lookback period) and "is this ticker's own
# total-return/drawdown/vol figure trustworthy" (the window itself).
STRESS_MIN_COVERAGE_FRACTION = 0.9
