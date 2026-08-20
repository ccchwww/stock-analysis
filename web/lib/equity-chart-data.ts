import type { EquityPoint } from "./types";

export type ChartSeriesInput = {
  id: string;
  equityCurve: EquityPoint[];
};

export type EquityChartPoint = { date: string } & Record<string, number>;

// Merges any number of independently-sampled equity curves into one array
// keyed by date, so a single <LineChart> can plot all of them together.
// A series that starts later (e.g. a strategy with a warm-up period, or a
// stock combined into a portfolio only from the date it's selected) simply
// has no entry for earlier dates -- Line's connectNulls handles that as
// "this line hasn't started yet".
export function buildEquityChartData(seriesList: ChartSeriesInput[]): EquityChartPoint[] {
  const byDate = new Map<string, EquityChartPoint>();

  for (const series of seriesList) {
    for (const point of series.equityCurve) {
      const row = byDate.get(point.date) ?? ({ date: point.date } as EquityChartPoint);
      row[series.id] = point.value;
      byDate.set(point.date, row);
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
