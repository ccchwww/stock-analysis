// "TICKER — Company Name" formatting shared everywhere a ticker is shown, so
// a user can always tell which company they're looking at, not just its
// symbol. Used in full where there's room (selector dropdown rows, table
// subtitles); callers fall back to ticker-only + a title attribute wherever
// space is tight (chips, chart legends, correlation matrix headers).
export function tickerWithName(ticker: string, name: string | undefined): string {
  return name && name !== ticker ? `${ticker} — ${name}` : ticker;
}
