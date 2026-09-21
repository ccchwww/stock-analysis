// One-click stock selections shared by every tab with a stock selector, so
// "what am I looking at" stays consistent across Strategies, Risk Dashboard,
// and Model Validation.
//
// The DEFAULT deliberately spans five distinct sectors. An earlier default
// was the Big 5 Canadian banks, whose average pairwise correlation is ~0.6
// over this window (and ~0.74 over the longer stress-test sample) -- high
// enough that the efficient frontier, correlation heatmap, and
// diversification sections all looked degenerate on first load, because
// there was essentially nothing to diversify. The sector-diverse default
// averages ~0.20 pairwise, so those sections show a real trade-off curve
// out of the box.
//
// Every ticker here is chosen for LONG price history as well as sector: all
// five have yfinance data back to 1995-1996, so the 2008 stress window's
// 3-year pre-window lookback (from 2005-06-18) is fully covered. This rules
// out recently-listed names -- SHOP.TO is the obvious trap, being a large
// TSX 60 constituent today with no data before 2015.

export type StockPreset = {
  key: string;
  label: string;
  tickers: string[];
  /** Shown under the preset buttons when this preset is the active selection. */
  note: string;
};

export const SECTOR_DIVERSE_PRESET: StockPreset = {
  key: "sector_diverse",
  label: "Sector-Diverse (default)",
  tickers: ["RY.TO", "ENB.TO", "CNR.TO", "BCE.TO", "ABX.TO"],
  note:
    "Five sectors — financials (RY), energy (ENB), rail/industrials (CNR), telecom (BCE), materials (ABX). " +
    "Average pairwise correlation is roughly 0.2 over this window, so the efficient frontier and correlation " +
    "heatmap show a real diversification trade-off. All five have price history back to the 1990s, so the " +
    "2008 stress window and its 3-year lookback are fully covered.",
};

export const BIG_FIVE_BANKS_PRESET: StockPreset = {
  key: "big_five_banks",
  label: "Big 5 Banks (concentration demo)",
  tickers: ["RY.TO", "TD.TO", "BNS.TO", "BMO.TO", "CM.TO"],
  note:
    "Deliberately concentrated: five Canadian banks in a single sector, averaging roughly 0.6 pairwise " +
    "correlation over this window (and ~0.74 over the longer stress-test sample). Useful for watching what " +
    "happens when correlations are high — the efficient frontier collapses toward a line, the correlation " +
    "heatmap goes uniformly hot, and the stress tests show correlations rising further exactly when " +
    "diversification is most needed.",
};

export const STOCK_PRESETS: StockPreset[] = [SECTOR_DIVERSE_PRESET, BIG_FIVE_BANKS_PRESET];

export const DEFAULT_TICKERS = SECTOR_DIVERSE_PRESET.tickers;

/** True when `selected` is exactly this preset's tickers, order-independent. */
export function isPresetActive(preset: StockPreset, selected: string[]): boolean {
  if (preset.tickers.length !== selected.length) return false;
  const set = new Set(selected);
  return preset.tickers.every((t) => set.has(t));
}

/** The default selection, filtered to tickers that actually exist in the
 * loaded data -- falls back to the first few available names if fewer than
 * 2 survive, same guard the dashboards already used. */
export function defaultSelection(available: (ticker: string) => boolean, fallback: string[]): string[] {
  const defaults = DEFAULT_TICKERS.filter(available);
  return defaults.length >= 2 ? defaults : fallback;
}
