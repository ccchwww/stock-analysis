// Slices a (dates, returns) pair down to a user-chosen start date. Dates are
// ISO strings ("YYYY-MM-DD"), so string comparison sorts correctly.
//
// This is the core of Feature 2 (selectable start date): every metric,
// equity curve, and correlation on both tabs is recomputed from whichever
// slice this produces, rather than being fixed to one precomputed window.
export function sliceFromDate<T>(
  dates: string[],
  series: T[],
  startDate: string,
): { dates: string[]; series: T[] } {
  let startIndex = dates.findIndex((d) => d >= startDate);
  if (startIndex === -1) startIndex = dates.length; // startDate is after all available data
  return { dates: dates.slice(startIndex), series: series.slice(startIndex) };
}
