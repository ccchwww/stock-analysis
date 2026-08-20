export type RollingChartRow = { date: string } & Record<string, number | null>;

// Merges N rolling-metric series that all share the SAME date grid -- they're
// all derived from the same start-date-sliced window by position, unlike
// equity curves -- into one row-per-date array a single <LineChart> can plot.
export function buildRollingChartData(
  dates: string[],
  seriesList: Array<{ id: string; values: (number | null)[] }>,
): RollingChartRow[] {
  return dates.map((date, i) => {
    const row = { date } as RollingChartRow;
    for (const s of seriesList) row[s.id] = s.values[i] ?? null;
    return row;
  });
}

// Downsamples for charting, same approach as sampleForChart in
// equity-curve.ts, generalized to rows with multiple metric columns instead
// of one value column. Always keeps the first and last row.
export function sampleRowsForChart<T extends { date: string }>(
  rows: T[],
  targetPoints = 250,
): T[] {
  if (rows.length <= targetPoints) return rows;
  const step = Math.ceil(rows.length / targetPoints);
  const sampled = rows.filter((_, i) => i % step === 0);
  const last = rows[rows.length - 1];
  if (sampled[sampled.length - 1]?.date !== last.date) sampled.push(last);
  return sampled;
}
