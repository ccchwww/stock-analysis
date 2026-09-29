"use client";

import { useEffect, useState } from "react";

// Amber "data may be stale" badge shown next to the footer's "Data as of"
// stamp.
//
// This HAS to be a Client Component, and the comparison has to happen after
// mount rather than during render. The site is statically prerendered and
// only rebuilds when a refresh actually succeeds and pushes, so at build time
// the data is by definition as fresh as it will ever be -- a server-side
// comparison would bake in "not stale" forever and never fire on the one day
// it matters, which is precisely the day the refresh job stopped working.
// Reading the clock on the viewer's machine is the only way to notice that
// nothing new has shipped.

/** Mirrors MAX_STALE_BUSINESS_DAYS in backtest/check_data.py. */
const STALE_AFTER_BUSINESS_DAYS = 4;

/** Past this gap it is stale by any measure; no need to walk the calendar. */
const MAX_LOOKBACK_DAYS = 45;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parses "YYYY-MM-DD" as LOCAL midnight. `new Date("2026-09-28")` would parse
 * it as UTC midnight, which is the previous day for every viewer west of
 * Greenwich -- enough to skew a four-day threshold by a whole day.
 */
function parseIsoDateLocal(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Weekdays falling in (start, end]. Same convention as check_data.py's
 * business_days_after, statutory holidays included as "business days" for the
 * same reason: the four-day budget is what absorbs them.
 */
function businessDaysBetween(start: Date, end: Date): number {
  // Both are local midnights, so rounding absorbs the 23/25-hour DST days.
  const calendarDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  if (calendarDays <= 0) return 0;
  if (calendarDays > MAX_LOOKBACK_DAYS) return Number.POSITIVE_INFINITY;

  let count = 0;
  const cursor = new Date(start);
  for (let i = 0; i < calendarDays; i += 1) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export default function DataFreshnessBadge({ asOf }: { asOf: string }) {
  // Starts false so the first client render matches the prerendered HTML
  // (which has no badge); the effect below flips it on if warranted.
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const asOfDate = parseIsoDateLocal(asOf);
    if (!asOfDate) return;

    const evaluate = () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      setStale(businessDaysBetween(asOfDate, today) > STALE_AFTER_BUSINESS_DAYS);
    };

    evaluate();
    // A tab left open across a long weekend should start warning on its own.
    // Hourly is already far finer than a day-granularity answer needs.
    const timer = window.setInterval(evaluate, 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [asOf]);

  if (!stale) return null;

  return (
    <span
      title={`The last successful refresh published data through ${asOf}. Nothing newer has been deployed since, so the daily job may have stopped.`}
      className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
    >
      data may be stale
    </span>
  );
}
