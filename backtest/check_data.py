#!/usr/bin/env python3
"""
Safety gate between regenerating the JSON and committing it.

Compares every freshly written file in web/public/ against the version
currently committed (`git show HEAD:web/public/<file>`) and exits non-zero
with a specific message if anything looks wrong. The refresh workflow only
commits when this passes, so a bad yfinance response -- a truncated window,
a vanished ticker, a silently stale payload -- gets thrown away with the
runner instead of being published.

What is checked, and why each one exists:

  * Every file still parses and still has the same top-level keys. Catches a
    truncated write or a shape change nobody meant to ship.
  * The end date never moves backwards. New data must extend the series.
  * No ticker disappears and the count never shrinks. data.py silently drops
    names with < MIN_HISTORY_FRACTION coverage, so a bad download shows up as
    a smaller universe rather than an error.
  * The ^GSPTSE benchmark is present and actually has the new dates. Beta and
    Alpha need paired (stock, market) observations; a benchmark that stops
    updating breaks them quietly.
  * No NEW daily return exceeds 40% in absolute value -- the signature of a
    missed split or a bad print.
  * Overlap consistency: on dates present in BOTH vintages, the daily returns
    still agree. Compared as RETURNS, never prices: auto_adjust=True means
    every past adjusted close is restated after each dividend, so prices
    legitimately shift while returns do not. A small mismatch fraction is
    tolerated (Yahoo restates the odd print) and is always reported.
  * Staleness: the new end date must be within MAX_STALE_BUSINESS_DAYS of
    today. Yahoo returning last week's window is otherwise indistinguishable
    from a market holiday.

Return-level checks run against market_data.json, the canonical price source.
results.json carries per-strategy series derived from its own download, so it
gets the structural, date and ticker checks only.

Usage:
    python check_data.py                      # the normal CI/local run
    python check_data.py --public-dir DIR     # check a copy (failure demos)
    python check_data.py --ref <rev>          # compare against another commit
    python check_data.py --today 2026-10-15   # pin "now" for staleness tests
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
PUBLIC_RELDIR = "web/public"

# Everything the daily refresh rewrites. stress_data.json is deliberately
# absent: refresh.sh does not regenerate it.
DATA_FILES = ("market_data.json", "results.json", "risk.json", "validation.json")

# The subset carrying meta.date_range / meta.tickers_used. risk.json and
# validation.json are pure config dumps -- structure is all there is to check.
DATED_FILES = ("market_data.json", "results.json")

BENCHMARK_TICKER = "^GSPTSE"

# A real TSX 60 large-cap moving more than this in one session is a data
# error far more often than it is news.
MAX_ABS_DAILY_RETURN = 0.40

# Returns are stored rounded to 6dp, so anything above this is a genuine
# restatement rather than float noise.
RETURN_TOLERANCE = 1e-4
MAX_MISMATCH_FRACTION = 0.01

MAX_STALE_BUSINESS_DAYS = 4


class Report:
    """Collects failures so one run surfaces every problem, not just the first."""

    def __init__(self):
        self.problems = []

    def ok(self, message):
        print(f"  ok    {message}")

    def fail(self, message):
        print(f"  FAIL  {message}")
        self.problems.append(message)


def git_show(ref, relpath):
    """Previous committed contents of a file, as text."""
    proc = subprocess.run(
        ["git", "show", f"{ref}:{relpath}"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise LookupError(proc.stderr.strip() or f"git show {ref}:{relpath} failed")
    return proc.stdout


def series_by_date(payload):
    """{ticker: {date: return}} for a market_data.json-shaped payload.

    The JSON stores each return series as a bare array aligned BY POSITION to
    meta.dates, so comparing two vintages means re-keying by date first --
    positions shift the moment a single trading day is added or dropped.
    Nulls are omitted, so a date's absence means "no usable return".
    """
    dates = payload["meta"]["dates"]
    entries = list(payload.get("stocks", {}).values())
    benchmark = payload.get("benchmark")
    if benchmark:
        entries.append(benchmark)

    out = {}
    for entry in entries:
        ticker = entry.get("ticker", "<unnamed>")
        returns = entry["returns"]
        if len(returns) != len(dates):
            raise ValueError(
                f"{ticker}: {len(returns)} returns against {len(dates)} dates -- "
                "the by-position alignment with meta.dates is broken"
            )
        out[ticker] = {d: r for d, r in zip(dates, returns) if r is not None}
    return out


def business_days_after(start, end):
    """Weekdays falling in (start, end]. 0 when end is on or before start.

    Weekends only -- statutory holidays are not modelled, which is exactly why
    the staleness budget is 4 days rather than 1.
    """
    count = 0
    cursor = start + timedelta(days=1)
    while cursor <= end:
        if cursor.weekday() < 5:
            count += 1
        cursor += timedelta(days=1)
    return count


def load_both(report, public_dir, ref):
    """Parse the new and previous version of every file; check top-level keys."""
    new_data, old_data = {}, {}

    for name in DATA_FILES:
        path = public_dir / name
        try:
            new_data[name] = json.loads(path.read_text())
        except FileNotFoundError:
            report.fail(f"{name}: not found at {path}")
            continue
        except json.JSONDecodeError as exc:
            report.fail(f"{name}: newly generated file is not valid JSON -- {exc}")
            continue

        try:
            old_data[name] = json.loads(git_show(ref, f"{PUBLIC_RELDIR}/{name}"))
        except LookupError as exc:
            report.fail(f"{name}: cannot read the previous version from {ref} -- {exc}")
            continue
        except json.JSONDecodeError as exc:
            report.fail(f"{name}: previous committed version is not valid JSON -- {exc}")
            continue

        new_keys = sorted(new_data[name])
        old_keys = sorted(old_data[name])
        if new_keys != old_keys:
            report.fail(
                f"{name}: top-level keys changed -- was {old_keys}, now {new_keys}"
            )
        else:
            report.ok(f"{name}: parses, top-level keys unchanged {new_keys}")

    return new_data, old_data


def check_dates_and_tickers(report, new_data, old_data, today):
    """End date never regresses, data is fresh, no ticker went missing."""
    facts = {}

    for name in DATED_FILES:
        if name not in new_data or name not in old_data:
            continue
        new_meta = new_data[name]["meta"]
        old_meta = old_data[name]["meta"]

        old_end = date.fromisoformat(old_meta["date_range"]["end"])
        new_end = date.fromisoformat(new_meta["date_range"]["end"])
        if new_end < old_end:
            report.fail(
                f"{name}: end date moved BACKWARDS, {old_end} -> {new_end}. New "
                "data must extend the series, never truncate it."
            )
        else:
            report.ok(f"{name}: end date {old_end} -> {new_end} (not earlier)")

        behind = business_days_after(new_end, today)
        if behind > MAX_STALE_BUSINESS_DAYS:
            report.fail(
                f"{name}: data ends {new_end}, {behind} business days before "
                f"{today} (limit {MAX_STALE_BUSINESS_DAYS}). Yahoo most likely "
                "returned a stale window."
            )
        else:
            report.ok(
                f"{name}: fresh -- {behind} business day(s) between {new_end} and {today}"
            )

        old_tickers = old_meta["tickers_used"]
        new_tickers = new_meta["tickers_used"]
        new_set = set(new_tickers)
        missing = [t for t in old_tickers if t not in new_set]
        if missing:
            report.fail(
                f"{name}: {len(missing)} previously present ticker(s) are gone: "
                + ", ".join(missing)
            )
        elif len(new_tickers) < len(old_tickers):
            report.fail(
                f"{name}: ticker count dropped {len(old_tickers)} -> {len(new_tickers)}"
            )
        else:
            report.ok(
                f"{name}: {len(new_tickers)} tickers, all {len(old_tickers)} previous ones present"
            )

        facts[name] = {
            "old_end": old_end,
            "new_end": new_end,
            "old_rows": len(old_meta["dates"]),
            "new_rows": len(new_meta["dates"]),
            "tickers": len(new_tickers),
        }

    return facts


def check_returns(report, new_data, old_data):
    """Benchmark coverage, implausible new moves, and overlap consistency."""
    name = "market_data.json"
    if name not in new_data or name not in old_data:
        return None

    try:
        new_series = series_by_date(new_data[name])
        old_series = series_by_date(old_data[name])
    except (ValueError, KeyError) as exc:
        report.fail(f"{name}: {exc}")
        return None

    new_dates = new_data[name]["meta"]["dates"]
    old_end = old_data[name]["meta"]["date_range"]["end"]
    # ISO-8601 sorts lexicographically, so plain string comparison is fine.
    added_dates = [d for d in new_dates if d > old_end]

    # --- benchmark present, and covering the newly added days ---
    benchmark = new_data[name].get("benchmark") or {}
    if benchmark.get("ticker") != BENCHMARK_TICKER:
        report.fail(
            f"{name}: benchmark {BENCHMARK_TICKER} is missing (found "
            f"{benchmark.get('ticker')!r}) -- Beta/Alpha have no market to price against"
        )
    else:
        bench_series = new_series.get(BENCHMARK_TICKER, {})
        gaps = [d for d in added_dates if d not in bench_series]
        if gaps:
            report.fail(
                f"{name}: benchmark {BENCHMARK_TICKER} has no return on "
                f"{len(gaps)} of the {len(added_dates)} new date(s): "
                + ", ".join(gaps[:5])
                + (" ..." if len(gaps) > 5 else "")
            )
        else:
            report.ok(
                f"{name}: benchmark {BENCHMARK_TICKER} present and covers all "
                f"{len(added_dates)} new date(s)"
            )

    # --- implausible new daily moves ---
    extremes = []
    for ticker, by_date in new_series.items():
        for d in added_dates:
            value = by_date.get(d)
            if value is not None and abs(value) > MAX_ABS_DAILY_RETURN:
                extremes.append((ticker, d, value))
    if extremes:
        extremes.sort(key=lambda row: abs(row[2]), reverse=True)
        listed = "; ".join(f"{t} on {d}: {v:+.1%}" for t, d, v in extremes[:10])
        report.fail(
            f"{name}: {len(extremes)} new daily return(s) exceed "
            f"{MAX_ABS_DAILY_RETURN:.0%} -- {listed}"
            + (" ..." if len(extremes) > 10 else "")
        )
    else:
        report.ok(
            f"{name}: no new daily return exceeds {MAX_ABS_DAILY_RETURN:.0%} "
            f"across {len(added_dates)} new date(s)"
        )

    # --- overlap consistency, on returns rather than prices ---
    compared = 0
    mismatches = []
    for ticker, old_by_date in old_series.items():
        new_by_date = new_series.get(ticker)
        if new_by_date is None:
            continue  # already reported as a missing ticker
        for d, old_value in old_by_date.items():
            new_value = new_by_date.get(d)
            if new_value is None:
                continue
            compared += 1
            if abs(new_value - old_value) > RETURN_TOLERANCE:
                mismatches.append((ticker, d, old_value, new_value))

    fraction = len(mismatches) / compared if compared else 0.0
    if compared == 0:
        report.fail(
            f"{name}: no overlapping (ticker, date) returns between the two "
            "vintages at all -- the new file does not look like a continuation "
            "of the old one"
        )
    elif fraction > MAX_MISMATCH_FRACTION:
        mismatches.sort(key=lambda row: abs(row[3] - row[2]), reverse=True)
        listed = "; ".join(
            f"{t} on {d}: {o:+.6f} -> {n:+.6f}" for t, d, o, n in mismatches[:10]
        )
        report.fail(
            f"{name}: {len(mismatches)}/{compared} overlapping returns changed by "
            f"more than {RETURN_TOLERANCE:g} ({fraction:.2%}, limit "
            f"{MAX_MISMATCH_FRACTION:.0%}) -- {listed}"
            + (" ..." if len(mismatches) > 10 else "")
        )
    else:
        report.ok(
            f"{name}: overlap consistent -- {len(mismatches)}/{compared} shared "
            f"returns differ by more than {RETURN_TOLERANCE:g} ({fraction:.4%})"
        )

    return {
        "added_dates": len(added_dates),
        "compared": compared,
        "mismatches": len(mismatches),
        "mismatch_fraction": fraction,
    }


def emit_github_output(facts):
    """Hand the new end date to the workflow so it can build the commit message."""
    output_path = os.environ.get("GITHUB_OUTPUT")
    market = facts.get("market_data.json")
    if not output_path or not market:
        return
    with open(output_path, "a") as handle:
        handle.write(f"new_end={market['new_end']}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Validate regenerated web/public JSON against the committed version."
    )
    parser.add_argument(
        "--public-dir",
        default=str(REPO_ROOT / "web" / "public"),
        help="Directory holding the NEW files (default: web/public).",
    )
    parser.add_argument(
        "--ref",
        default="HEAD",
        help="Git revision holding the PREVIOUS files (default: HEAD).",
    )
    parser.add_argument(
        "--today",
        default=None,
        help="Override today's date (YYYY-MM-DD) for the staleness check.",
    )
    args = parser.parse_args()

    today = date.fromisoformat(args.today) if args.today else date.today()
    public_dir = Path(args.public_dir).resolve()

    report = Report()
    print(f"Checking {public_dir}")
    print(f"against  {args.ref}:{PUBLIC_RELDIR}/   (today = {today})")
    print()

    new_data, old_data = load_both(report, public_dir, args.ref)
    facts = check_dates_and_tickers(report, new_data, old_data, today)
    overlap = check_returns(report, new_data, old_data)

    print()
    if report.problems:
        print(f"FAILED -- {len(report.problems)} check(s) did not pass:")
        for problem in report.problems:
            print(f"  - {problem}")
        print("\nNothing should be committed. The previous JSON stays live.")
        return 1

    market = facts.get("market_data.json", {})
    print("PASSED")
    print(f"  old end date : {market.get('old_end')}")
    print(f"  new end date : {market.get('new_end')}")
    if overlap:
        print(f"  rows added   : {overlap['added_dates']} new trading day(s)")
    # PERIOD is a rolling "5y" window, so the total row count barely moves:
    # days fall off the front as they are added to the back.
    print(
        f"  window rows  : {market.get('old_rows')} -> {market.get('new_rows')} "
        f"(rolling {market.get('new_rows', 0) - market.get('old_rows', 0):+d}, "
        f"oldest days roll off the front)"
    )
    print(f"  tickers      : {market.get('tickers')} (+ benchmark {BENCHMARK_TICKER})")
    if overlap:
        print(
            f"  overlap      : {overlap['mismatches']}/{overlap['compared']} shared "
            f"returns differ ({overlap['mismatch_fraction']:.4%})"
        )

    emit_github_output(facts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
