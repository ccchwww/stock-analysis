// One consistent color per strategy id, reused across the chart, legend, and
// table so a strategy always reads the same color everywhere on the page.
export const STRATEGY_COLORS: Record<string, string> = {
  momentum_1d: "#38bdf8", // sky
  momentum_12m: "#a78bfa", // violet
  mean_reversion: "#fb923c", // orange
  low_vol: "#f472b6", // pink — deliberately far from buy_hold's emerald, which
  // teal was not: the two sat side by side in the legend as near-identical dots
  buy_hold: "#34d399", // emerald — the same-universe benchmark
};

export const DEFAULT_STRATEGY_COLOR = "#a1a1aa";

export function colorForStrategy(id: string): string {
  return STRATEGY_COLORS[id] ?? DEFAULT_STRATEGY_COLOR;
}
